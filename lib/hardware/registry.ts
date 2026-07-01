export interface DeviceHealth {
  status: 'OK' | 'ERROR' | 'OFFLINE';
  details: string;
  latency_ms?: number;
}

export abstract class DeviceDriver {
  public id: string;
  public type: 'scale' | 'printer' | 'display' | 'scanner' | 'drawer';
  public name: string;
  protected isConnected = false;

  constructor(id: string, type: 'scale' | 'printer' | 'display' | 'scanner' | 'drawer', name: string) {
    this.id = id;
    this.type = type;
    this.name = name;
  }

  abstract connect(): Promise<boolean>;
  abstract disconnect(): Promise<boolean>;
  abstract getHealth(): Promise<DeviceHealth>;

  get connectionState(): boolean {
    return this.isConnected;
  }
}

export abstract class ScaleDriver extends DeviceDriver {
  constructor(id: string, name: string) {
    super(id, 'scale', name);
  }
  abstract getWeight(): Promise<number>; // returns weight in kg
}

export abstract class PrinterDriver extends DeviceDriver {
  constructor(id: string, name: string) {
    super(id, 'printer', name);
  }
  abstract printReceiptSlip(text: string): Promise<boolean>;
  abstract cutPaper(): Promise<boolean>;
}

export abstract class DisplayDriver extends DeviceDriver {
  constructor(id: string, name: string) {
    super(id, 'display', name);
  }
  abstract showText(line1: string, line2: string): Promise<boolean>;
  abstract clear(): Promise<boolean>;
}
