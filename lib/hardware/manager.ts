import { DeviceDriver, DeviceHealth } from './registry';
import { MettlerToledoDriver } from './drivers/scale';
import { EscPosPrinterDriver } from './drivers/printer';

export class HardwareManager {
  private static instance: HardwareManager | null = null;
  private devices: Map<string, DeviceDriver> = new Map();

  private constructor() {}

  public static getInstance(): HardwareManager {
    if (!HardwareManager.instance) {
      HardwareManager.instance = new HardwareManager();
    }
    return HardwareManager.instance;
  }

  /**
   * Registers a hardware driver plugin to the active checkout lane context.
   */
  public registerDevice(device: DeviceDriver): void {
    this.devices.set(device.id, device);
    console.log(`[Hardware Manager] Registered device: ${device.name} [ID: ${device.id}]`);
  }

  public getDevice<T extends DeviceDriver>(id: string): T | undefined {
    return this.devices.get(id) as T;
  }

  public getAllDevices(): DeviceDriver[] {
    return Array.from(this.devices.values());
  }

  /**
   * Performs an automatic diagnostic sweep, monitoring latencies and connections.
   */
  async runHealthCheckSweep(): Promise<Record<string, DeviceHealth>> {
    const report: Record<string, DeviceHealth> = {};
    for (const [id, dev] of this.devices.entries()) {
      try {
        report[id] = await dev.getHealth();
      } catch (err: any) {
        report[id] = { status: 'ERROR', details: `Sürücü hatası: ${err.message}` };
      }
    }
    return report;
  }

  /**
   * Discovers and configures devices based on local config files.
   */
  async autoDiscoverStoreDevices(): Promise<void> {
    // Clear existing devices to prevent stale sockets
    this.devices.clear();

    // Mock profiles mapping standard supermarket checkout register profiles
    this.registerDevice(new MettlerToledoDriver(
      'scale-lane-1',
      'Mettler Toledo Kasa Terazisi (Lane 1)',
      { ipAddress: '127.0.0.1', port: 9991 }
    ));

    this.registerDevice(new EscPosPrinterDriver(
      'printer-lane-1',
      'Epson TM-T88VI Fiş Yazıcı (Lane 1)',
      { ipAddress: '127.0.0.1', port: 9992 }
    ));
  }
}
