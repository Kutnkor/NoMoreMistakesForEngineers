export type BoardProfile = {
  digital: string[];
  analog: string[];
  pwm: string[];
  i2c: { sda: string; scl: string };
  fqbn: string;
  adc: 'avr10' | 'set10' | 'esp32';
  adcReference: number;
  codePins?: Record<string, string>;
  compiled?: boolean;
  i2cSetup?: 'esp32' | 'rp2040';
};
export type Board = {
  id: string;
  name: string;
  family: string;
  mcu: string;
  logicVoltage: number | null;
  analogInputs: number | null;
  digitalPins: number | null;
  description: string;
  sourceUrl: string;
  notes: string[];
  profile?: BoardProfile;
  lifecycle?: string;
};
export type Template =
  | 'passive'
  | 'led'
  | 'rgb'
  | 'button'
  | 'analog'
  | 'tmp36'
  | 'lm35'
  | 'piezo'
  | 'hcsr04'
  | 'bme280'
  | 'bmp280'
  | 'ads1115'
  | 'mcp4725'
  | 'ssd1306'
  | 'ds3231'
  | 'mpu6050'
  | 'vl53l0x'
  | 'dht22'
  | 'ds18b20'
  | 'servo'
  | 'filter';
export type Component = {
  id: string;
  name: string;
  category: string;
  description: string;
  interface: string;
  partKind: string;
  supplyRange: [number, number] | null;
  logicMax: number | null;
  addresses: number[];
  additionalAddresses?: number[];
  sourceUrl: string;
  notes: string[];
  requires: string[];
  template?: Template;
  library?: string;
  externalPower?: boolean;
};
export type Selection = { id: string; componentId: string; address?: number };
export type Issue = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  text: string;
  itemId?: string;
};
export type Wire = {
  itemId: string;
  signal: string;
  boardPin: string;
  role: 'digital' | 'analog' | 'pwm' | 'i2c' | 'power' | 'ground';
  note?: string;
};
export type PlannedItem = {
  selection: Selection;
  component: Component;
  pins: Record<string, string>;
  power: string | null;
};
export type HardwarePlan = {
  board: Board;
  items: PlannedItem[];
  wires: Wire[];
  issues: Issue[];
  libraries: string[];
  canGenerate: boolean;
  usedPins: string[];
  unsupported: number;
};
export type FilterTransfer = {
  r1: number;
  r2: number;
  c1: number;
  c2: number;
  passHz: number;
  stopHz: number;
};
