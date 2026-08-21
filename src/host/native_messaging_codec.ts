///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	NativeMessagingCodec — Chrome's length-prefixed framing on standard input and output
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Reads and writes Chrome native messages.
 *
 * The framing is a four-byte little-endian length followed by that many bytes of UTF-8 JSON. Standard
 * output belongs entirely to this channel: a stray `console.log` corrupts the stream and Chrome closes
 * the connection with no useful error, so everything else this program says must go to standard error.
 */
export class NativeMessagingCodec {
	/** The incoming stream. */
	input: NodeJS.ReadableStream;

	/** The outgoing stream. */
	output: NodeJS.WritableStream;

	/** Bytes read but not yet forming a whole message. */
	buffer: Buffer;

	/** Called with each decoded message. */
	onMessage: (message: unknown) => void;

	/** Called when the other side goes away. */
	onClose: () => void;

	/**
	 * @param input - Where messages arrive, normally `process.stdin`.
	 * @param output - Where messages go, normally `process.stdout`.
	 */
	constructor(input: NodeJS.ReadableStream, output: NodeJS.WritableStream) {
		this.input = input;
		this.output = output;
		this.buffer = Buffer.alloc(0);
		this.onMessage = () => {};
		this.onClose = () => {};
	}

	/**
	 * Starts reading.
	 *
	 * @returns Nothing.
	 */
	start(): void {
		this.input.on('data', (chunk: Buffer) => {
			this.buffer = Buffer.concat([this.buffer, chunk]);
			this._drain();
		});
		this.input.on('end', () => {
			this.onClose();
		});
		this.input.on('close', () => {
			this.onClose();
		});
	}

	/**
	 * Sends one message.
	 *
	 * @param message - Anything JSON can represent.
	 * @returns Nothing.
	 */
	send(message: unknown): void {
		const body = Buffer.from(JSON.stringify(message), 'utf8');
		const header = Buffer.alloc(4);
		header.writeUInt32LE(body.length, 0);
		this.output.write(Buffer.concat([header, body]));
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Pulls every whole message out of the buffer.
	 *
	 * @returns Nothing.
	 */
	_drain(): void {
		while (this.buffer.length >= 4) {
			const length = this.buffer.readUInt32LE(0);
			if (this.buffer.length < 4 + length) {
				return;
			}
			const body = this.buffer.subarray(4, 4 + length);
			this.buffer = this.buffer.subarray(4 + length);
			try {
				this.onMessage(JSON.parse(body.toString('utf8')));
			} catch (error) {
				process.stderr.write(`could not decode a native message: ${(error as Error).message}\n`);
			}
		}
	}
}
