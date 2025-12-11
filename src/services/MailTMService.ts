import axios from 'axios';

interface EmailCredentials {
  address: string;
  password: string;
}

export class MailTMService {
  private readonly baseUrl = 'https://api.mail.tm';
  private account: any = null;
  private token: string | null = null;

  async createTemporaryEmail(): Promise<EmailCredentials> {
    try {
      console.log('Creating temporary email account...');
      // First get available domains
      const domainsResponse = await axios.get(`${this.baseUrl}/domains`);
      //Chhose random domain
      const randomIndex = Math.floor(Math.random() * domainsResponse.data['hydra:member'].length);
      const domain = domainsResponse.data['hydra:member'][randomIndex].domain;
      console.log('Selected domain:', domain);

      // Generate random username and password
      const username = `user_${Math.random().toString(36).substring(2, 8)}`;
      const password = Math.random().toString(36).substring(2, 8);
      console.log('Generated credentials:', { username, password });

      // Create account
      console.log('Creating account on mail.gw...');
      await axios.post(`${this.baseUrl}/accounts`, {
        address: `${username}@${domain}`,
        password: password
      });
      console.log('Account created successfully');

      // Login to get token
      console.log('Logging in to get token...');
      const loginResponse = await axios.post(`${this.baseUrl}/token`, {
        address: `${username}@${domain}`,
        password: password
      });

      this.token = loginResponse.data.token;
      this.account = { address: `${username}@${domain}`, password };
      console.log('Login successful, token received');

      return {
        address: `${username}@${domain}`,
        password: password
      };
    } catch (error) {
      console.error('Error creating temporary email:', error);
      throw new Error('Failed to create temporary email');
    }
  }

  async waitForVerificationEmail(timeout: number = 120000): Promise<string> {
    if (!this.token) {
      throw new Error('No authentication token available');
    }

    console.log('Starting to wait for verification email...');
    console.log('Account:', this.account.address);
    console.log('Timeout:', timeout / 1000, 'seconds');

    const startTime = Date.now();
    let lastMessageId = '';
    let checkCount = 0;

    while (Date.now() - startTime < timeout) {
      try {
        checkCount++;
        console.log(`\nCheck #${checkCount} - Time elapsed: ${Math.floor((Date.now() - startTime) / 1000)}s`);
        
        const response = await axios.get(`${this.baseUrl}/messages`, {
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        });

        const messages = response.data['hydra:member'];
        console.log(`Found ${messages?.length || 0} messages in inbox`);

        if (messages && messages.length > 0) {
          // Sort messages by date (newest first)
          messages.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          
          // Log all messages for debugging
          messages.forEach((msg: any, index: number) => {
            console.log(`Message ${index + 1}:`, {
              id: msg.id,
              from: msg.from.address,
              subject: msg.subject,
              date: new Date(msg.createdAt).toLocaleString()
            });
          });

          // Find the newest message from pornolab.net
          const verificationEmail = messages.find((msg: any) => 
            msg.from.address.includes('pornolab.net') && msg.id !== lastMessageId
          );

          if (verificationEmail) {
            console.log('\nFound verification email:', {
              id: verificationEmail.id,
              from: verificationEmail.from.address,
              subject: verificationEmail.subject,
              date: new Date(verificationEmail.createdAt).toLocaleString()
            });
            
            lastMessageId = verificationEmail.id;

            // Get email content
            console.log('Fetching email content...');
            const emailContent = await axios.get(
              `${this.baseUrl}/messages/${verificationEmail.id}`,
              {
                headers: {
                  'Authorization': `Bearer ${this.token}`
                }
              }
            );

            console.log('Email content received, length:', emailContent.data.text.length);
            console.log('First 200 characters of content:', emailContent.data.text.substring(0, 200));

            // Extract verification link from email content
            const verificationLink = this.extractVerificationLink(emailContent.data.text);
            if (verificationLink) {
              console.log('Successfully extracted verification link:', verificationLink);
              return verificationLink;
            } else {
              console.log('No verification link found in email content');
            }
          } else {
            console.log('No new verification email found');
          }
        }

        // Wait for 5 seconds before next check
        console.log('Waiting 5 seconds before next check...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error('Error checking for verification email:', error);
        if (axios.isAxiosError(error)) {
          console.error('Axios error details:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data
          });
        }
        // Wait for 5 seconds before retrying
        console.log('Waiting 5 seconds before retry...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    console.error('Timeout reached without finding verification email');
    throw new Error('Verification email not received within timeout period');
  }

  private extractVerificationLink(emailContent: string): string | null {
    console.log('Attempting to extract verification link...');
    // Look for activation link in the email content
    const patterns = [
      /https:\/\/pornolab\.net\/forum\/profile\.php\?mode=activate&u=\d+&act_key=[a-zA-Z0-9]+/,
      /https:\/\/pornolab\.net\/forum\/profile\.php\?mode=activate.*?act_key=[a-zA-Z0-9]+/,
      /https:\/\/pornolab\.net\/forum\/.*?mode=activate.*?act_key=[a-zA-Z0-9]+/
    ];

    for (const pattern of patterns) {
      const match = emailContent.match(pattern);
      if (match) {
        console.log('Found matching pattern:', pattern.toString());
        console.log('Full match:', match[0]);
        return match[0];
      }
    }

    console.log('No verification link found with any pattern');
    return null;
  }
} 