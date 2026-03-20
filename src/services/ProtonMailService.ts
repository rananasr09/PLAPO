import { ImapFlow } from 'imapflow';
import { DatabaseService } from './DatabaseService';

interface EmailCredentials {
  address: string;
  password: string;
}

export class ProtonMailService {
  private readonly localPart: string;
  private readonly domain: string;
  private readonly bridgeHost: string;
  private readonly bridgePort: number;
  private readonly bridgeUser: string;
  private readonly bridgePassword: string;
  private availableVariants: string[] = [];
  private currentVariant: string | null = null;

  constructor(private db: DatabaseService) {
    const protonEmail = process.env.PROTON_EMAIL || 'rananasr09@proton.me';
    const [localPart, domain] = protonEmail.split('@');
    this.localPart = localPart;
    this.domain = domain;
    this.bridgeHost = process.env.PROTON_BRIDGE_HOST || '127.0.0.1';
    this.bridgePort = parseInt(process.env.PROTON_BRIDGE_PORT || '1143', 10);
    this.bridgeUser = protonEmail;
    this.bridgePassword = process.env.PROTON_BRIDGE_PASSWORD || '';

    this.initializeVariants();
  }

  private generateDotVariants(localPart: string): string[] {
    const positions = localPart.length - 1;
    const variants: string[] = [];

    for (let mask = 0; mask < (1 << positions); mask++) {
      let result = localPart[0];
      for (let i = 1; i < localPart.length; i++) {
        if (mask & (1 << (i - 1))) {
          result += '.';
        }
        result += localPart[i];
      }
      variants.push(`${result}@${this.domain}`);
    }

    return variants;
  }

  private initializeVariants() {
    const allVariants = this.generateDotVariants(this.localPart);
    const usedEmails = this.db.getUsedProtonEmails(this.domain);
    const usedSet = new Set(usedEmails.map(e => e.toLowerCase()));

    this.availableVariants = allVariants.filter(
      v => !usedSet.has(v.toLowerCase())
    );

    console.log(`ProtonMail variants: ${this.availableVariants.length}/${allVariants.length} available`);
  }

  getAvailableCount(): number {
    return this.availableVariants.length;
  }

  async createTemporaryEmail(): Promise<EmailCredentials> {
    if (this.availableVariants.length === 0) {
      throw new Error('No more email variants available (all 256 used)');
    }

    const variant = this.availableVariants.shift()!;
    this.currentVariant = variant;

    console.log(`Using ProtonMail variant: ${variant}`);

    return {
      address: variant,
      password: 'N/A'
    };
  }

  async waitForVerificationEmail(timeout: number = 120000): Promise<string> {
    if (!this.currentVariant) {
      throw new Error('No current email variant set');
    }

    const targetAddress = this.currentVariant.toLowerCase();
    const startTime = Date.now();
    let checkCount = 0;

    console.log(`Waiting for verification email to: ${targetAddress}`);
    console.log(`Timeout: ${timeout / 1000} seconds`);

    const client = new ImapFlow({
      host: this.bridgeHost,
      port: this.bridgePort,
      secure: false,
      auth: {
        user: this.bridgeUser,
        pass: this.bridgePassword
      },
      logger: false
    });

    try {
      await client.connect();

      while (Date.now() - startTime < timeout) {
        checkCount++;
        console.log(`\nCheck #${checkCount} - Time elapsed: ${Math.floor((Date.now() - startTime) / 1000)}s`);

        const lock = await client.getMailboxLock('INBOX');
        try {
          // Search for recent messages
          const searchCriteria = {
            since: new Date(startTime - 60000), // 1 minute before start to catch fast emails
          };

          const searchResult = await client.search(searchCriteria);
          const messages = searchResult || [];
          console.log(`Found ${Array.isArray(messages) ? messages.length : 0} messages since start`);

          if (!Array.isArray(messages)) continue;

          for (const seq of messages) {
            const fetchResult = await client.fetchOne(seq, {
              envelope: true,
              source: true
            });

            if (!fetchResult) continue;
            const msg = fetchResult;

            // Check if from pornolab.net
            const fromAddress = msg.envelope?.from?.[0]?.address || '';
            if (!fromAddress.toLowerCase().includes('pornolab.net')) {
              continue;
            }

            // Check To: header matches our specific dot variant
            const toAddresses = msg.envelope?.to?.map(
              (t: any) => t.address?.toLowerCase()
            ) || [];

            if (!toAddresses.includes(targetAddress)) {
              continue;
            }

            console.log('Found verification email:', {
              from: fromAddress,
              to: toAddresses,
              subject: msg.envelope?.subject,
              date: msg.envelope?.date
            });

            // Extract verification link from email source
            const emailText = msg.source?.toString() || '';
            console.log('Email content length:', emailText.length);
            console.log('First 200 chars:', emailText.substring(0, 200));

            const link = this.extractVerificationLink(emailText);
            if (link) {
              console.log('Extracted verification link:', link);
              return link;
            }

            console.log('No verification link found in this email');
          }
        } finally {
          lock.release();
        }

        console.log('Waiting 5 seconds before next check...');
        await new Promise(r => setTimeout(r, 5000));
      }

      throw new Error('Verification email not received within timeout period');
    } catch (error) {
      if ((error as Error).message.includes('timeout')) {
        throw error;
      }
      console.error('IMAP error:', error);
      throw new Error(`Failed to check emails: ${(error as Error).message}. Is hydroxide running?`);
    } finally {
      try {
        await client.logout();
      } catch {
        // Ignore logout errors
      }
    }
  }

  private extractVerificationLink(emailContent: string): string | null {
    console.log('Attempting to extract verification link...');

    const patterns = [
      /https:\/\/pornolab\.net\/forum\/profile\.php\?mode=activate&u=\d+&act_key=[a-zA-Z0-9]+/,
      /https:\/\/pornolab\.net\/forum\/profile\.php\?mode=activate.*?act_key=[a-zA-Z0-9]+/,
      /https:\/\/pornolab\.net\/forum\/.*?mode=activate.*?act_key=[a-zA-Z0-9]+/
    ];

    for (const pattern of patterns) {
      const match = emailContent.match(pattern);
      if (match) {
        console.log('Found matching pattern:', pattern.toString());
        return match[0];
      }
    }

    console.log('No verification link found with any pattern');
    return null;
  }
}
