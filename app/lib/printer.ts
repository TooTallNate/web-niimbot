import { NiimbotPacket } from './packet';
import { binaryStringToBytes, sleep } from './util';

export type Bit = 0 | 1;

// Service UUIDs
//49535343-fe7d-4ae5-8fa9-9fafd205e455 (Handle: 12): Unknown
//e7810a71-73ae-499d-8c15-faa9aef0c3f2 (Handle: 23): Unknown
const SERVICE_UUID = 'e7810a71-73ae-499d-8c15-faa9aef0c3f2';

// Characteristic UUIDs
//const characteristicUuid = "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f";

export enum InfoEnum {
	DENSITY = 1,
	PRINTSPEED = 2,
	LABELTYPE = 3,
	LANGUAGETYPE = 6,
	AUTOSHUTDOWNTIME = 7,
	DEVICETYPE = 8,
	SOFTVERSION = 9,
	BATTERY = 10,
	DEVICESERIAL = 11,
	HARDVERSION = 12,
}

export enum RequestCodeEnum {
	GET_INFO = 64,
	GET_RFID = 26,
	HEARTBEAT = 220,
	SET_LABEL_TYPE = 35,
	SET_LABEL_DENSITY = 33,
	START_PRINT = 1,
	END_PRINT = 243,
	START_PAGE_PRINT = 3,
	END_PAGE_PRINT = 227,
	ALLOW_PRINT_CLEAR = 32,
	SET_DIMENSION = 19,
	SET_QUANTITY = 21,
	GET_PRINT_STATUS = 163,
}

export class PrinterClient {
	device?: BluetoothDevice;
	characteristic?: BluetoothRemoteGATTCharacteristic;
	#heartbeatInterval?: ReturnType<typeof setInterval>;

	constructor(
		device: BluetoothDevice,
		characteristic: BluetoothRemoteGATTCharacteristic
	) {
		this.device = device;
		this.characteristic = characteristic;
		device.addEventListener(
			'gattserverdisconnected',
			this.onDisconnect.bind(this)
		);
	}

	static async connect(deviceNamePrefix: string): Promise<PrinterClient> {
		const device = await navigator.bluetooth.requestDevice({
			filters: [{ namePrefix: deviceNamePrefix }],
			optionalServices: [SERVICE_UUID],
		});

		const server = await device.gatt?.connect();
		if (!server) throw new Error('Failed to connect to GATT server');

		// Find the correct service and characteristic
		let characteristic: BluetoothRemoteGATTCharacteristic | undefined;
		const service = await server.getPrimaryService(SERVICE_UUID);
		const characteristics = await service.getCharacteristics();
		for (const char of characteristics) {
			const properties = char.properties;
			if (
				properties.read &&
				properties.writeWithoutResponse &&
				properties.notify
			) {
				characteristic = char;
				break;
			}
		}
		if (!characteristic)
			throw new Error('Required characteristic not found');

		return new PrinterClient(device, characteristic);
	}

	disconnect(): void {
		if (this.device?.gatt?.connected) {
			this.device.gatt.disconnect();
		}
	}

	private onDisconnect() {
		clearInterval(this.#heartbeatInterval);
		this.device = undefined;
		this.characteristic = undefined;
	}

	private async sendCommand(
		requestCode: RequestCodeEnum,
		data: Uint8Array
	): Promise<NiimbotPacket> {
		const { characteristic } = this;
		if (!characteristic) {
			throw new Error('Not connected to printer');
		}

		const packet = new NiimbotPacket(requestCode, data);

		// Set up notification listener
		const responsePromise = new Promise<NiimbotPacket>(
			(resolve, reject) => {
				const timeout = setTimeout(
					() => reject(new Error('Command timeout')),
					10000
				);

				characteristic.addEventListener(
					'characteristicvaluechanged',
					(event) => {
						clearTimeout(timeout);
						const value = (
							event.target as BluetoothRemoteGATTCharacteristic
						).value;
						if (!value) return;

						const response = NiimbotPacket.fromBytes(
							new Uint8Array(value.buffer)
						);
						resolve(response);
					},
					{ once: true }
				);
			}
		);

		try {
			// Start notifications
			await characteristic.startNotifications();

			// Send command
			await characteristic.writeValueWithoutResponse(packet.toBytes());

			// Wait for response
			const response = await responsePromise;

			return response;
		} finally {
			// Stop notifications
			await characteristic.stopNotifications();
		}
	}

	async writeRaw(data: Uint8Array) {
		try {
			if (!this.characteristic) {
				throw new Error('Not connected to printer');
			}

			await this.characteristic.writeValue(data);
		} catch (error) {
			console.error('Error writing to printer:', error);
		}
	}

	async *printImage(lines: Bit[][], density = 3, quantity = 1) {
		const width = lines[0].length;
		const height = lines.length;

		await this.setLabelDensity(density);
		await this.setLabelType(1);
		await this.startPrint();
		await this.startPagePrint();
		await this.setDimension(height, width);
		await this.setQuantity(quantity);

		for (let line = 0; line < height; line++) {
			const pkt = this._encodeLine(line, lines[line]);

			// Send each line and wait for a response or status check
			await this.writeRaw(pkt.toBytes());

			yield { type: 'WRITE_LINE' as const, line };

			// Adding a short delay or status check here can help manage buffer issues
			await sleep(10); // Adjust the delay as needed based on printer feedback
		}

		while (!(await this.endPagePrint())) {
			await sleep(50);
		}

		yield { type: 'END_PAGE' as const };

		let previousPage = 0;
		while (true) {
			const status = await this.getPrintStatus();
			if (status.page !== previousPage) {
				yield { type: 'PAGE_STATUS' as const, ...status };
				previousPage = status.page;
			}
			if (status.page === quantity) {
				break;
			}
			await sleep(100);
		}

		await this.endPrint();
	}

	_encodeLine(lineNumber: number, line: Bit[]) {
		const header = new Uint8Array(6);
		const headerView = new DataView(header.buffer);
		headerView.setUint16(0, lineNumber, false);
		header[2] = 0;
		header[3] = 0;
		header[4] = 0;
		header[5] = 1;
		const packet = new NiimbotPacket(
			0x85,
			new Uint8Array([...header, ...binaryStringToBytes(line.join(''))])
		);
		return packet;
	}

	async heartbeat() {
		const packet = await this.sendCommand(
			RequestCodeEnum.HEARTBEAT,
			new Uint8Array([1])
		);
		let closingState: number | undefined;
		let powerLevel: number | undefined;
		let paperState: number | undefined;
		let rfidReadState: number | undefined;
		switch (packet.data.length) {
			case 20:
				paperState = packet.data[18];
				rfidReadState = packet.data[19];
				break;
			case 13:
				closingState = packet.data[9];
				powerLevel = packet.data[10];
				paperState = packet.data[11];
				rfidReadState = packet.data[12];
				break;
			case 19:
				closingState = packet.data[15];
				powerLevel = packet.data[16];
				paperState = packet.data[17];
				rfidReadState = packet.data[18];
				break;
			case 10:
				closingState = packet.data[8];
				powerLevel = packet.data[9];
				rfidReadState = packet.data[8];
				break;
			case 9:
				closingState = packet.data[8];
				break;
		}
		return {
			closingState,
			powerLevel,
			paperState,
			rfidReadState,
		};
	}

	startHeartbeat(interval = 5000) {
		clearInterval(this.#heartbeatInterval);
		this.#heartbeatInterval = setInterval(async () => {
			const heartbeat = await this.heartbeat();
			//console.log(heartbeat);
		}, interval);
	}

	async getInfo(key: InfoEnum): Promise<Uint8Array> {
		const response = await this.sendCommand(
			RequestCodeEnum.GET_INFO,
			new Uint8Array([key])
		);
		return response.data;
	}

	async setLabelType(n: number): Promise<boolean> {
		if (n < 1 || n > 3) {
			throw new Error('Label type must be between 1 and 3');
		}

		const response = await this.sendCommand(
			RequestCodeEnum.SET_LABEL_TYPE,
			new Uint8Array([n])
		);

		return Boolean(response.data[0]);
	}

	async setLabelDensity(n: number): Promise<boolean> {
		if (n < 1 || n > 5) {
			throw new Error('Label density must be between 1 and 5');
		}

		const response = await this.sendCommand(
			RequestCodeEnum.SET_LABEL_DENSITY,
			new Uint8Array([n])
		);

		return Boolean(response.data[0]);
	}

	async startPrint(): Promise<boolean> {
		const response = await this.sendCommand(
			RequestCodeEnum.START_PRINT,
			new Uint8Array([1])
		);
		return Boolean(response.data[0]);
	}

	async endPrint(): Promise<boolean> {
		const response = await this.sendCommand(
			RequestCodeEnum.END_PRINT,
			new Uint8Array([1])
		);
		return Boolean(response.data[0]);
	}

	async startPagePrint(): Promise<boolean> {
		const response = await this.sendCommand(
			RequestCodeEnum.START_PAGE_PRINT,
			new Uint8Array([1])
		);
		return Boolean(response.data[0]);
	}

	async endPagePrint(): Promise<boolean> {
		const response = await this.sendCommand(
			RequestCodeEnum.END_PAGE_PRINT,
			new Uint8Array([1])
		);
		return Boolean(response.data[0]);
	}

	async allowPrintClear(): Promise<boolean> {
		const response = await this.sendCommand(
			RequestCodeEnum.ALLOW_PRINT_CLEAR,
			new Uint8Array([1])
		);
		return Boolean(response.data[0]);
	}

	async setDimension(w: number, h: number): Promise<boolean> {
		const data = new Uint8Array(4);
		const view = new DataView(data.buffer);
		view.setUint16(0, w, false);
		view.setUint16(2, h, false);
		const response = await this.sendCommand(
			RequestCodeEnum.SET_DIMENSION,
			data
		);
		return Boolean(response.data[0]);
	}

	async setQuantity(n: number): Promise<boolean> {
		const data = new Uint8Array(2);
		const view = new DataView(data.buffer);
		view.setUint16(0, n, false);
		const response = await this.sendCommand(
			RequestCodeEnum.SET_QUANTITY,
			data
		);
		return Boolean(response.data[0]);
	}

	async getPrintStatus(): Promise<{
		page: number;
		progress1: number;
		progress2: number;
	}> {
		const response = await this.sendCommand(
			RequestCodeEnum.GET_PRINT_STATUS,
			new Uint8Array([1])
		);
		const view = new DataView(response.data.buffer);
		const page = view.getUint16(0, false);
		const progress1 = response.data[2];
		const progress2 = response.data[3];
		return { page, progress1, progress2 };
	}
}
