# Device Setup Guide — Peripherals Configuration

This document guide details configuring weighing scales, thermal printers, and customer displays with the **Aydın GROS OS** hardware abstraction layer.

---

## 1. Mettler Toledo Weighing Scales Setup

Aydın GROS OS queries scales using the **Dialog 06** serial protocol.

### Physical Wiring
- Connect the Mettler Toledo scale to the POS lane register using a DB9 RS-232 serial cable.
- If the register lacks a native serial port, use an RS-232 to USB adapter (Prolific/FTDI chipset).
- If communicating over local network, use a Serial-to-Ethernet TCP bridge device configured to the scale port.

### Interface Configuration
In `C:\AydınGrosOS\lib\hardware\manager.ts` (or the local node dashboard config):
```typescript
{
  id: "scale-lane-1",
  ipAddress: "127.0.0.1", // or scale IP address
  port: 9991             // mapped TCP socket port
}
```
- **Baud Rate:** `9600`
- **Data Bits:** `7`
- **Parity:** `Even`
- **Stop Bits:** `1`

---

## 2. ESC/POS Receipt Printer Setup

Thermal printers must support Epson standard ESC/POS binary format and Turkish CP857 print encoding.

### Settings
In the printer driver properties or on the printer web portal, set:
- **Default Code Page:** `CP857 (Turkish)`
- **Interface Protocol:** `ESC/POS`

### Configuration
Update the registry manager block:
```typescript
{
  id: "printer-lane-1",
  ipAddress: "127.0.0.1",
  port: 9992
}
```
- Ensure the paper width is configured to `80mm` for standard retail slips.
