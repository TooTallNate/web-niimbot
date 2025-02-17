export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function binaryStringToBytes(binaryString: string): Uint8Array {
    // Calculate how many bytes we need (rounding up length/8)
    const numBytes = Math.ceil(binaryString.length / 8);
    const result = new Uint8Array(numBytes);

    // Pad the binary string with zeros on the right if needed
    const paddedBinary = binaryString.padEnd(numBytes * 8, '0');

    // Process 8 bits at a time
    for (let i = 0; i < numBytes; i++) {
        const byte = paddedBinary.slice(i * 8, (i + 1) * 8);
        // Convert 8 bits to a number
        result[i] = Number.parseInt(byte, 2);
    }

    return result;
}
