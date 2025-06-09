import { Server, Socket } from 'socket.io';
import axios from 'axios';
import { MailTMService } from './MailTMService';
import { CaptchaService } from './CaptchaService';
import { DatabaseService, Account } from './DatabaseService';

interface EmailCredentials {
  address: string;
  password: string;
}

export class AccountCreator {
  private mailTMService: MailTMService;
  private captchaService: CaptchaService;

  constructor(
    private db: DatabaseService,
    private io: Server
  ) {
    this.mailTMService = new MailTMService();
    this.captchaService = new CaptchaService();
  }

  async startCreation(count: number, socket: Socket) {
    for (let i = 0; i < count; i++) {
      try {
        // Generate random username and password
        const username = this.generateRandomString(8);
        const password = this.generateRandomString(12);

        // Emit progress update - Starting
        socket.emit('creationProgress', {
          current: i + 1,
          total: count,
          status: 'in_progress',
          currentStep: 'Generating credentials',
          account: { 
            username, 
            password,
            email: '',
            emailPassword: ''
          }
        });

        // Create temporary email
        const email = await this.mailTMService.createTemporaryEmail();
        
        // Emit progress update - Email created
        socket.emit('creationProgress', {
          current: i + 1,
          total: count,
          status: 'in_progress',
          currentStep: 'Email created',
          account: { 
            username, 
            password, 
            email: email.address, 
            emailPassword: email.password 
          }
        });
        
        // Get registration form data
        socket.emit('creationProgress', {
          current: i + 1,
          total: count,
          status: 'in_progress',
          currentStep: 'Fetching registration form',
          account: { 
            username, 
            password, 
            email: email.address, 
            emailPassword: email.password 
          }
        });

        const formData = await this.getRegistrationFormData();
        
        // Show captcha to user and wait for solution
        socket.emit('showCaptcha', {
          captchaUrl: formData.captchaUrl,
          current: i + 1,
          total: count
        });

        socket.emit('creationProgress', {
          current: i + 1,
          total: count,
          status: 'in_progress',
          currentStep: 'Waiting for captcha solution',
          account: { 
            username, 
            password, 
            email: email.address, 
            emailPassword: email.password 
          }
        });

        // Wait for user to solve captcha
        const captchaSolution = await new Promise<string>((resolve) => {
          socket.once('captchaSolved', (solution: string) => {
            resolve(solution);
          });
        });

        // Submit registration
        socket.emit('creationProgress', {
          current: i + 1,
          total: count,
          status: 'in_progress',
          currentStep: 'Submitting registration',
          account: { 
            username, 
            password, 
            email: email.address, 
            emailPassword: email.password 
          }
        });

        const registrationResult = await this.submitRegistration({
          username,
          password,
          email: email.address,
          captchaSolution,
          formData
        });

        // Wait for activation email and activate account
        if (registrationResult.success) {
          socket.emit('creationProgress', {
            current: i + 1,
            total: count,
            status: 'in_progress',
            currentStep: 'Waiting for activation email',
            account: { 
              username, 
              password, 
              email: email.address, 
              emailPassword: email.password 
            }
          });

          try {
            const activationLink = await this.mailTMService.waitForVerificationEmail();
            
            socket.emit('creationProgress', {
              current: i + 1,
              total: count,
              status: 'in_progress',
              currentStep: 'Activating account',
              account: { 
                username, 
                password, 
                email: email.address, 
                emailPassword: email.password 
              }
            });

            // Visit activation link
            const activationResult = await axios.get(activationLink, {
              headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'accept-language': 'en-US,en;q=0.9,ar;q=0.8',
                'cache-control': 'max-age=0',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
              },
              maxRedirects: 5,
              validateStatus: (status) => status < 400
            });

            // Store account in database
            const accountData: Account = {
              username,
              password,
              email: email.address,
              emailPassword: email.password,
              status: 'success',
              timestamp: new Date().toISOString()
            };
            await this.db.storeAccount(accountData);

            // Emit progress update
            socket.emit('creationProgress', {
              current: i + 1,
              total: count,
              status: 'success',
              currentStep: 'Account activated',
              account: accountData
            });

          } catch (error) {
            console.error('Error during activation:', error);
            const accountData: Account = {
              username,
              password,
              email: email.address,
              emailPassword: email.password,
              status: 'failed',
              timestamp: new Date().toISOString()
            };
            await this.db.storeAccount(accountData);

            socket.emit('creationProgress', {
              current: i + 1,
              total: count,
              status: 'failed',
              currentStep: 'Activation failed: ' + (error as Error).message,
              account: accountData
            });
          }
        } else {
          // Store failed account in database
          const accountData: Account = {
            username,
            password,
            email: email.address,
            emailPassword: email.password,
            status: 'failed',
            timestamp: new Date().toISOString()
          };
          await this.db.storeAccount(accountData);

          // Emit progress update
          socket.emit('creationProgress', {
            current: i + 1,
            total: count,
            status: 'failed',
            currentStep: 'Registration failed',
            account: accountData
          });
        }

      } catch (error) {
        console.error(`Error creating account ${i + 1}:`, error);
        socket.emit('creationError', {
          current: i + 1,
          total: count,
          error: (error as Error).message
        });
      }
    }
  }

  private generateRandomString(length: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private async getRegistrationFormData(): Promise<{
    captchaUrl: string;
    captchaSid: string;
    captchaCodeName: string;
    formUrl: string;
  }> {
    try {
      const formData = new FormData();
      formData.append('mode', 'register');
      formData.append('reg_agreed', '1');

      const response = await axios.post('https://pornolab.net/forum/profile.php', formData, {
        headers: {
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'accept-language': 'en-US,en;q=0.9,ar;q=0.8',
          'cache-control': 'max-age=0',
          'content-type': 'multipart/form-data',
          'origin': 'https://pornolab.net',
          'referer': 'https://pornolab.net/forum/profile.php',
          'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'same-origin',
          'sec-fetch-user': '?1',
          'upgrade-insecure-requests': '1',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
        }
      });

      const captchaUrlMatch = response.data.match(/<img[^>]+src="([^"]+captcha[^"]+)"/);
      const captchaSidMatch = response.data.match(/name="cap_sid" value="([^"]+)"/);
      const captchaCodeNameMatch = response.data.match(/name="cap_code_([^"]+)"/);

      if (!captchaUrlMatch || !captchaSidMatch || !captchaCodeNameMatch) {
        throw new Error('Could not extract form data from registration page');
      }

      // Ensure captcha URL has proper domain
      const captchaUrl = captchaUrlMatch[1].startsWith('//') 
        ? `https:${captchaUrlMatch[1]}`
        : captchaUrlMatch[1];

      return {
        captchaUrl,
        captchaSid: captchaSidMatch[1],
        captchaCodeName: captchaCodeNameMatch[1],
        formUrl: 'https://pornolab.net/forum/profile.php'
      };
    } catch (error) {
      console.error('Error fetching registration form:', error);
      throw new Error('Failed to fetch registration form data');
    }
  }

  private async submitRegistration(data: {
    username: string;
    password: string;
    email: string;
    captchaSolution: string;
    formData: {
      captchaSid: string;
      captchaCodeName: string;
      formUrl: string;
    };
  }) {
    try {
      const formData = new FormData();
      formData.append('mode', 'register');
      formData.append('reg_agreed', '1');
      formData.append('username', data.username);
      formData.append('new_pass', data.password);
      formData.append('cfm_pass', data.password);
      formData.append('user_email', data.email);
      formData.append('cap_sid', data.formData.captchaSid);
      formData.append(`cap_code_${data.formData.captchaCodeName}`, data.captchaSolution);
      formData.append('user_flag_id', '0');
      formData.append('user_timezone_x2', '6');
      formData.append('submit', 'Отправить (Я согласен с условиями)');

      const response = await axios.post(data.formData.formUrl, formData, {
        headers: {
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'accept-language': 'en-US,en;q=0.9,ar;q=0.8',
          'cache-control': 'max-age=0',
          'content-type': 'multipart/form-data',
          'origin': 'https://pornolab.net',
          'referer': 'https://pornolab.net/forum/profile.php',
          'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'same-origin',
          'sec-fetch-user': '?1',
          'upgrade-insecure-requests': '1',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 400
      });

      // Check if registration was successful
      const success = !response.data.includes('error') && 
                     !response.data.includes('captcha') &&
                     response.data.includes('success');

      return { success: true };
    } catch (error) {
      console.error('Error submitting registration:', error);
      return { success: false };
    }
  }
} 