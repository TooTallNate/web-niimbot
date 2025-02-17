export class NiimbotPacket {
    type: number;
    data: Uint8Array;

    constructor(type: number, data: Uint8Array) {
        this.type = type;
        this.data = data;
    }

    static fromBytes(pkt: Uint8Array): NiimbotPacket {
        // Check packet start and end markers
        if (pkt[0] !== 0x55 || pkt[1] !== 0x55 ||
            pkt[pkt.length - 2] !== 0xaa || pkt[pkt.length - 1] !== 0xaa) {
            throw new Error("Invalid packet markers");
        }

        const type = pkt[2];
        const length = pkt[3];
        const data = pkt.slice(4, 4 + length);

        // Verify checksum
        let checksum = type ^ length;
        for (const byte of data) {
            checksum ^= byte;
        }

        if (checksum !== pkt[pkt.length - 3]) {
            throw new Error("Checksum verification failed");
        }

        return new NiimbotPacket(type, data);
    }

    toBytes(): Uint8Array {
        let checksum = this.type ^ this.data.length;
        for (const byte of this.data) {
            checksum ^= byte;
        }

        const packet = new Uint8Array(this.data.length + 7);
        packet[0] = 0x55;
        packet[1] = 0x55;
        packet[2] = this.type;
        packet[3] = this.data.length;
        packet.set(this.data, 4);
        packet[packet.length - 3] = checksum;
        packet[packet.length - 2] = 0xAA;
        packet[packet.length - 1] = 0xAA;

        return packet;
    }
}
