# Account Creator

A Node.js application for automating account creation on pornolab.net with real-time progress tracking and email verification.

## Features

- Automated account creation
- Temporary email generation using mail.tm
- Real-time progress tracking
- Account history storage using Redis
- Modern web interface
- Captcha solving integration

## Prerequisites

- Node.js (v14 or higher)
- Redis server
- Captcha solving service API key (2captcha, Anti-Captcha, etc.)

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   PORT=3000
   REDIS_URL=redis://localhost:6379
   CAPTCHA_API_KEY=your_captcha_service_api_key
   ```

4. Start Redis server

5. Build and run the application:
   ```bash
   npm run build
   npm start
   ```

## Usage

1. Open your browser and navigate to `http://localhost:3000`
2. Enter the number of accounts you want to create
3. Click "Start Creation"
4. Monitor the progress in real-time
5. View created accounts in the history table

## Project Structure

- `src/server.ts` - Main server file
- `src/services/AccountCreator.ts` - Account creation logic
- `src/services/MailTMService.ts` - Temporary email handling
- `src/services/CaptchaService.ts` - Captcha solving integration
- `public/index.html` - Web interface

## Notes

- The application uses mail.tm for temporary email generation
- Captcha solving requires integration with a third-party service
- Account creation speed may be limited by the target website's rate limiting
- Use responsibly and in accordance with the target website's terms of service

## License

MIT 