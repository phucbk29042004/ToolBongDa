FROM node:20-alpine

WORKDIR /app

# Copy package files from backend
COPY backend/package*.json ./backend/

# Install backend dependencies
WORKDIR /app/backend
RUN npm ci --omit=dev

# Copy the rest of the application
WORKDIR /app
COPY backend ./backend
COPY frontend ./frontend

# Change working directory back to backend for starting the server
WORKDIR /app/backend

# Expose port
EXPOSE 3001

# Command to run the application
CMD ["npm", "start"]
