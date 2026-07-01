import * as net from 'net';
import { PrinterDriver, DeviceHealth } from '../registry';

// Maps Unicode Turkish characters to binary CP857 thermal printing bytes
const CP857_TURKISH_MAP: Record<string, number> = {
  'ç': 0x87, 'Ç': 0x80,
  'ğ': 0xA7, 'Ğ': 0xA6,
  'ı': 0x8D, 'İ': 0x98,
  'ö': 0x94, 'Ö': 0x99,
  'ş': 0x9F, 'Ş': 0x9E,
  'ü': 0x81, 'Ü': 0x9A
};

export class EscPosPrinterDriver extends PrinterDriver {
  private ip: string;
  private port: number;

  constructor(id: string, name: string, config: { ipAddress: string; port: number }) {
    super(id, name);
    this.ip = config.ipAddress;
    this.port = config.port;
  }

  async connect(): Promise<boolean> {
    try {
      const socket = new net.Socket();
      socket.setTimeout(800);
      return new Promise((resolve) => {
        socket.connect(this.port, this.ip, () => {
          socket.destroy();
          this.isConnected = true;
          resolve(true);
        });
        socket.on('error', () => {
          socket.destroy();
          this.isConnected = false;
          resolve(false);
        });
      });
    } catch {
      this.isConnected = false;
      return false;
    }
  }

  async disconnect(): Promise<boolean> {
    this.isConnected = false;
    return true;
  }

  /**
   * Encodes a string into CP857 binary buffer compatible with Epson/Bixolon printers.
   */
  public encodeCP857(text: string): Buffer {
    const bytes: number[] = [];
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (CP857_TURKISH_MAP[char] !== undefined) {
        bytes.push(CP857_TURKISH_MAP[char]);
      } else {
        bytes.push(char.charCodeAt(0) & 0xFF);
      }
    }
    return Buffer.from(bytes);
  }

  async printReceiptSlip(text: string): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);

      socket.connect(this.port, this.ip, () => {
        const initCmd = Buffer.from([0x1B, 0x40]); // ESC @ (Initialize printer)
        const content = this.encodeCP857(text);
        const lineFeed = Buffer.from([0x0A, 0x0A]); // LF

        socket.write(Buffer.concat([initCmd, content, lineFeed]), () => {
          socket.destroy();
          resolve(true);
        });
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  async cutPaper(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.connect(this.port, this.ip, () => {
        const cutCmd = Buffer.from([0x1D, 0x56, 0x01]); // GS V 1 (Paper Cut)
        socket.write(cutCmd, () => {
          socket.destroy();
          resolve(true);
        });
      });
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  async getHealth(): Promise<DeviceHealth> {
    const ok = await this.connect();
    return {
      status: ok ? 'OK' : 'OFFLINE',
      details: ok ? 'Yazıcı hazır ve çevrimiçi' : 'Yazıcıya erişilemiyor (Kablo veya ağ hatası)'
    };
  }
}
