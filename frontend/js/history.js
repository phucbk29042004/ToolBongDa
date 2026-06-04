const API = window.location.origin;
let historyData = [];
let accuracyChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Set default dates
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  document.getElementById('filterStartDate').value = thirtyDaysAgo;
  document.getElementById('filterEndDate').value = today;

  // Add event listeners
  document.getElementById('filterLeague').addEventListener('change', loadHistory);
  document.getElementById('filterStartDate').addEventListener('change', loadHistory);
  document.getElementById('filterEndDate').addEventListener('change', loadHistory);

  // Initial load
  await loadHistory();
});

async function loadHistory() {
  const league = document.getElementById('filterLeague').value;
  const startDate = document.getElementById('filterStartDate').value;
  const endDate = document.getElementById('filterEndDate').value;

  const tableBody = document.getElementById('historyTableBody');
  tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Đang tải dữ liệu...</td></tr>`;

  try {
    const url = new URL(`${API}/api/history`);
    if (league) url.searchParams.append('league', league);
    if (startDate) url.searchParams.append('startDate', startDate);
    if (endDate) url.searchParams.append('endDate', endDate);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const result = await res.json();
    historyData = result.history || [];

    renderSummary(historyData);
    renderTable(historyData);
    renderChart(historyData);
  } catch (err) {
    console.error('Failed to load history:', err);
    tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--red);">Lỗi tải dữ liệu lịch sử: ${err.message}</td></tr>`;
  }
}

function renderSummary(data) {
  const total = data.length;
  const finished = data.filter(p => p.status === 'FINISHED');
  
  const correct1X2 = finished.filter(p => p.is1X2Correct === true).length;
  const correctOU = finished.filter(p => p.isOUCorrect === true).length;

  const rate1X2 = finished.length > 0 ? ((correct1X2 / finished.length) * 100).toFixed(1) : '0';
  const rateOU = finished.length > 0 ? ((correctOU / finished.length) * 100).toFixed(1) : '0';

  document.getElementById('statTotal').textContent = total;
  document.getElementById('stat1X2').textContent = `${rate1X2}% (${correct1X2}/${finished.length})`;
  document.getElementById('statOU').textContent = `${rateOU}% (${correctOU}/${finished.length})`;
}

function renderTable(data) {
  const tableBody = document.getElementById('historyTableBody');
  if (data.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Không tìm thấy lịch sử dự đoán nào.</td></tr>`;
    return;
  }

  const leagueMap = {
    PL: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 EPL',
    PD: '🇪🇸 La Liga',
    BL1: '🇩🇪 Bundesliga',
    CL: '🇪🇺 CL'
  };

  tableBody.innerHTML = data.map(p => {
    const isFinished = p.status === 'FINISHED';
    
    // Pred values
    const predHome = p.predictedScore?.home ?? '-';
    const predAway = p.predictedScore?.away ?? '-';
    
    let pred1X2 = 'X';
    if (p.resultProbs) {
      const max = Math.max(p.resultProbs.home, p.resultProbs.draw, p.resultProbs.away);
      if (max === p.resultProbs.home) pred1X2 = '1';
      else if (max === p.resultProbs.away) pred1X2 = '2';
    }
    const predOU = (p.resultProbs?.over25 ?? 0.5) > 0.5 ? 'Tài' : 'Xỉu';

    // Actual values
    const actScore = p.actualScore ? `${p.actualScore.home}-${p.actualScore.away}` : '-';
    
    // Accuracy badges
    const badge1X2 = isFinished 
      ? `<span class="badge ${p.is1X2Correct ? 'badge-correct' : 'badge-incorrect'}">${p.is1X2Correct ? 'Đúng' : 'Sai'}</span>`
      : '<span style="color:var(--text-muted)">-</span>';
      
    const badgeOU = isFinished 
      ? `<span class="badge ${p.isOUCorrect ? 'badge-correct' : 'badge-incorrect'}">${p.isOUCorrect ? 'Đúng' : 'Sai'}</span>`
      : '<span style="color:var(--text-muted)">-</span>';

    const confidencePct = p.confidence ? `${Math.round(p.confidence * 100)}%` : '-';

    return `
      <tr>
        <td>${p.matchDate}</td>
        <td>${leagueMap[p.league] || p.league}</td>
        <td><strong>${p.homeTeam} vs ${p.awayTeam}</strong></td>
        <td>${predHome}-${predAway} (${pred1X2} | ${predOU})</td>
        <td>${actScore}</td>
        <td>${badge1X2}</td>
        <td>${badgeOU}</td>
        <td>${confidencePct}</td>
      </tr>
    `;
  }).join('');
}

function renderChart(data) {
  const finished = data.filter(p => p.status === 'FINISHED').reverse(); // Chronological order
  
  // Group by date
  const dateAccuracy = {};
  finished.forEach(p => {
    const date = p.matchDate;
    if (!dateAccuracy[date]) {
      dateAccuracy[date] = { total: 0, correct1X2: 0, correctOU: 0 };
    }
    dateAccuracy[date].total++;
    if (p.is1X2Correct) dateAccuracy[date].correct1X2++;
    if (p.isOUCorrect) dateAccuracy[date].correctOU++;
  });

  const labels = Object.keys(dateAccuracy);
  const data1X2 = labels.map(d => ((dateAccuracy[d].correct1X2 / dateAccuracy[d].total) * 100));
  const dataOU = labels.map(d => ((dateAccuracy[d].correctOU / dateAccuracy[d].total) * 100));

  const ctx = document.getElementById('accuracyChart').getContext('2d');
  
  if (accuracyChartInstance) {
    accuracyChartInstance.destroy();
  }

  accuracyChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Độ chính xác 1X2 (%)',
          data: data1X2,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.3,
          borderWidth: 2,
          fill: true
        },
        {
          label: 'Độ chính xác Tài/Xỉu (%)',
          data: dataOU,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.3,
          borderWidth: 2,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#e2e8f0'
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#94a3b8'
          }
        },
        y: {
          min: 0,
          max: 100,
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#94a3b8',
            callback: function(value) { return value + '%'; }
          }
        }
      }
    }
  });
}
