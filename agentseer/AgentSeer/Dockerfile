FROM node:20-alpine

# Use the existing node user (UID 1000) that comes with the image
USER node

# Set working directory
WORKDIR /app

# Copy package files with proper ownership
COPY --chown=node package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application with proper ownership
COPY --chown=node . /app

# Build the Next.js application
RUN npm run build

# Expose port 7860 for Hugging Face Spaces
EXPOSE 7860

# Start the application
CMD ["sh", "-c", "npm run start -- --hostname 0.0.0.0 --port ${PORT:-7860}"]

