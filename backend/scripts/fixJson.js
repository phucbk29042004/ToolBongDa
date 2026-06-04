import fs from 'fs';
import path from 'path';

function parseConcatenatedJson(content) {
  try {
    return JSON.parse(content);
  } catch (e) {
    console.log('File is not standard JSON, attempting brace-counting parse...');
    const blocks = [];
    let braceCount = 0;
    let startIdx = 0;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '{') {
        if (braceCount === 0) startIdx = i;
        braceCount++;
      } else if (content[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          try {
            const obj = JSON.parse(content.substring(startIdx, i + 1));
            blocks.push(obj);
          } catch (err) {
            // ignore malformed sub-blocks
          }
        }
      }
    }
    
    console.log(`Found ${blocks.length} JSON block(s) in the file.`);
    const merged = { teams: {} };
    for (const block of blocks) {
      if (block && block.teams) {
        Object.assign(merged.teams, block.teams);
      }
    }
    return merged;
  }
}

async function fix() {
  const filePath = path.resolve('understat_2526.json');
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found at: ${filePath}`);
    process.exit(1);
  }

  console.log(`⏳ Reading file: ${filePath}...`);
  const content = fs.readFileSync(filePath, 'utf8');
  
  const mergedData = parseConcatenatedJson(content);
  
  const teamCount = Object.keys(mergedData.teams).length;
  console.log(`✅ Merged data contains ${teamCount} teams.`);
  
  console.log(`⏳ Writing clean JSON back to: ${filePath}...`);
  fs.writeFileSync(filePath, JSON.stringify(mergedData, null, 4), 'utf8');
  console.log('🎉 File fixed successfully!');
}

fix().catch(console.error);
