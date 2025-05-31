declare module 'zkteco-js' {
  /**
   * Represents a user record on the ZKTeco device.
   */
  export interface User {
    /** Numeric user ID (badge number) */
    userId: number;
    /** Full name */
    name: string;
    /** Role or privilege level (e.g., 0=User, 14=Admin) */
    role: number;
    /** Optional password (if device exposes it) */
    password?: string;
    /** Optional fingerprint/template data */
    fingerprint?: any;
  }

  /**
   * Represents a single attendance log entry.
   */
  export interface AttendanceLog {
    /** Serial number/record index */
    sn: number;
    /** User ID who generated this log */
    user_id: number;
    /** Timestamp string, e.g. "2025-05-30T08:15:00Z" */
    record_time: string;
    /** Type code (e.g. 0=in, 1=out) */
    type: number;
    /** State code (e.g. normal, late, early) */
    state: number;
  }

  /**
   * Detailed metadata about the device itself.
   */
  export interface DeviceDetails {
    /** Device model name/number */
    model: string;
    /** Device firmware version */
    firmwareVersion: string;
    /** Device serial number */
    serialNumber: string;
    /** MAC address of the device */
    macAddress: string;
    /** Vendor/manufacturer */
    vendor: string;
    /** Platform or chipset info */
    platform: string;
    /** Any additional metadata the SDK returns */
    [key: string]: any;
  }

  /**
   * Main class to interact with a ZKTeco biometric device over TCP.
   */
  export default class Zkteco {
    /**
     * @param ip            IP address of the device
     * @param port          TCP port (usually 4370)
     * @param sendTimeout   timeout in ms for commands
     * @param recvTimeout   timeout in ms for responses
     */
    constructor(
      ip: string,
      port: number,
      sendTimeout?: number,
      recvTimeout?: number
    );

    /** Open the TCP socket to the device. */
    createSocket(): Promise<void>;

    /** Close the connection (if supported). */
    close?(): Promise<void>;

    /**
     * Fetch detailed device information.
     * Use this to populate your `deviceDetails` object.
     */
    getDeviceInfo(): Promise<DeviceDetails>;

    /**
     * Retrieve all users stored on the device.
     * Often returns an array or an object with a `.data` array.
     */
    getUsers(): Promise<User[] | { data: User[] } | Record<string, User>>;

    /**
     * Retrieve all attendance logs.
     * Often returns an array or an object with a `.data` array.
     */
    getAttendances(): Promise<
      AttendanceLog[] | { data: AttendanceLog[] } | Record<string, AttendanceLog>
    >;
  }
}
