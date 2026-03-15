/**
 * Network Audio Device Discovery.
 * Uses mDNS/Bonjour to discover LicheeRV Nano boards on the local network.
 * Zero-configuration: the board advertises via Avahi, Mac discovers automatically.
 */

import Bonjour, { type Service } from 'bonjour-service';
import { EventEmitter } from 'events';
import log from 'electron-log';

const logger = log.scope('audio-discovery');

const SERVICE_TYPE = 'typeless-mic';
const SERVICE_PROTOCOL = 'udp';

export interface DiscoveredDevice {
  /** Unique name from mDNS (e.g., "LicheeRV-a1b2c3") */
  name: string;
  /** IP addresses */
  addresses: string[];
  /** UDP port for audio streaming */
  port: number;
  /** TXT record metadata */
  meta: {
    format?: string;
    rate?: string;
    channels?: string;
    version?: string;
  };
}

export interface AudioDiscoveryEvents {
  'device-found': (device: DiscoveredDevice) => void;
  'device-lost': (name: string) => void;
}

export interface AudioDiscoveryService {
  on<K extends keyof AudioDiscoveryEvents>(event: K, listener: AudioDiscoveryEvents[K]): this;
  off<K extends keyof AudioDiscoveryEvents>(event: K, listener: AudioDiscoveryEvents[K]): this;
  emit<K extends keyof AudioDiscoveryEvents>(
    event: K,
    ...args: Parameters<AudioDiscoveryEvents[K]>
  ): boolean;
}

export class AudioDiscoveryService extends EventEmitter {
  private bonjour: InstanceType<typeof Bonjour> | null = null;
  private browser: ReturnType<InstanceType<typeof Bonjour>['find']> | null = null;
  private devices = new Map<string, DiscoveredDevice>();

  /**
   * Get all currently discovered devices.
   */
  get discoveredDevices(): DiscoveredDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Start browsing for boards on the local network.
   */
  start(): void {
    if (this.bonjour) return;

    this.bonjour = new Bonjour();
    this.browser = this.bonjour.find(
      { type: SERVICE_TYPE, protocol: SERVICE_PROTOCOL },
      (service: Service) => this.handleServiceUp(service),
    );

    this.browser.on('down', (service: Service) => {
      this.handleServiceDown(service);
    });

    logger.info('Audio device discovery started', { type: SERVICE_TYPE });
  }

  /**
   * Stop browsing.
   */
  stop(): void {
    if (this.browser) {
      this.browser.stop();
      this.browser = null;
    }
    if (this.bonjour) {
      this.bonjour.destroy();
      this.bonjour = null;
    }
    this.devices.clear();
    logger.info('Audio device discovery stopped');
  }

  private handleServiceUp(service: Service): void {
    const device: DiscoveredDevice = {
      name: service.name,
      addresses: service.addresses ?? [],
      port: service.port,
      meta: {
        format: service.txt?.format,
        rate: service.txt?.rate,
        channels: service.txt?.channels,
        version: service.txt?.version,
      },
    };

    this.devices.set(device.name, device);
    this.emit('device-found', device);
    logger.info('Board discovered', {
      name: device.name,
      addresses: device.addresses,
      port: device.port,
    });
  }

  private handleServiceDown(service: Service): void {
    if (this.devices.has(service.name)) {
      this.devices.delete(service.name);
      this.emit('device-lost', service.name);
      logger.info('Board went offline', { name: service.name });
    }
  }
}

export const audioDiscovery = new AudioDiscoveryService();
