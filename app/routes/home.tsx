import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import debounce from 'debounce';
import Editor from '@monaco-editor/react';
//import { initVimMode } from 'monaco-vim';
import satori from 'satori';
import * as Babel from '@babel/standalone';
import type { Route } from './+types/home';
import { PrinterClient, type Bit } from '~/lib/printer';
import { atkinson, bayer, floydsteinberg, threshold } from '~/lib/monochrome';
import { Preview } from '~/components/preview';
import { Button } from '~/components/ui/button';
import { useTheme } from '~/components/theme-provider';
import { Header } from '~/components/header';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';

import csstypeDecl from 'csstype/index.d.ts?raw';
import reactGlobalDecl from '~/assets/global.d.ts?raw';
import reactIndexDecl from '~/assets/index.d.ts?raw';
import jsxRuntimeDecl from '~/assets/jsx-runtime.d.ts?raw';
import geistNormal from '~/assets/Geist-Regular.ttf?arraybuffer';
import geistBold from '~/assets/Geist-Bold.ttf?arraybuffer';

const DEFAULT_DITHER_ALGORITHM = 'atkinson';

function compileJSX(jsx: string) {
	// Wrap JSX inside an expression for Babel to process
	const wrappedJSX = `(${jsx})`;

	// Transpile JSX to JavaScript
	const transformedCode = Babel.transform(wrappedJSX, {
		presets: ['react'],
	}).code;

	// Execute the transformed code safely
	return new Function('React', `return ${transformedCode}`)(React);
}

export function meta(_: Route.MetaArgs) {
	return [
		{ title: 'Niimbot Label Maker' },
		{ name: 'description', content: 'Label editor for Niimbot printers' },
	];
}

export default function App() {
	const { theme } = useTheme();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [code, setCode] = useState(`<div style={{
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
}}>
  <h1 style={{margin: 0}}>Hello World</h1>
  <div>This is a paragraph.</div>
</div>
`);
	const [error, setError] = useState<unknown>(null);
	const [dimensions, setDimensions] = useState({ width: 313, height: 96 });
	const [evalDelay, setEvalDelay] = useState(100);
	const [ditherAlgorithm, setDitherAlgorithm] = useState(
		DEFAULT_DITHER_ALGORITHM
	);
	const [ditherThreshold, setDitherThreshold] = useState(128);
	const [highlightColumn, setHighlightColumn] = useState<number | undefined>(
		undefined
	);

	const print = async () => {
		console.log('print');
		const canvas = canvasRef.current;
		if (!canvas) throw new Error('Failed to get canvas');
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) throw new Error('Failed to get 2d context');
		const { width, height } = canvas;

		// Create a new Canvas and apply dithering
		const ditheredCanvas = new OffscreenCanvas(width, height);
		const ditheredCtx = ditheredCanvas.getContext('2d', {
			willReadFrequently: true,
		});
		if (!ditheredCtx) throw new Error('Failed to get 2d context');
		const ditheredImageData = canvas
			.getContext('2d', { willReadFrequently: true })
			?.getImageData(0, 0, width, height);
		if (!ditheredImageData) return;
		applyDither?.(ditheredImageData);
		ditheredCtx.putImageData(ditheredImageData, 0, 0);

		// Create a new rotated Canvas and draw the dithered Canvas
		const rotated = new OffscreenCanvas(height, width);
		const rotatedCtx = rotated.getContext('2d', {
			willReadFrequently: true,
		});
		if (!rotatedCtx) throw new Error('Failed to get 2d context');
		rotatedCtx.fillStyle = 'white';
		rotatedCtx.fillRect(0, 0, rotated.width, rotated.height);
		rotatedCtx.translate(rotated.width, 0);
		rotatedCtx.rotate(Math.PI / 2);
		rotatedCtx.drawImage(ditheredCanvas, 0, 0, width, height);

		// Should not be necessary…
		rotatedCtx.rotate(-Math.PI / 2);
		rotatedCtx.translate(-rotated.width, 0);

		const lines: Bit[][] = new Array(rotated.height);
		const imageData = rotatedCtx.getImageData(
			0,
			0,
			rotated.width,
			rotated.height
		);
		//console.log({ imageData });
		for (let y = 0; y < imageData.height; y++) {
			const line: Bit[] = new Array(imageData.width);
			for (let x = 0; x < imageData.width; x++) {
				const pixelR =
					imageData.data[y * imageData.width * 4 + x * 4 + 0];
				const pixelG =
					imageData.data[y * imageData.width * 4 + x * 4 + 1];
				const pixelB =
					imageData.data[y * imageData.width * 4 + x * 4 + 2];
				const pixel = (pixelR + pixelG + pixelB) / 3;
				//console.log({ x, y, pixel, pixelR, pixelG, pixelB });
				line[x] = pixel > 128 ? 0 : 1;
			}
			lines[y] = line;
		}
		console.log(lines);

		const printer = await PrinterClient.connect('D11');
		printer.startHeartbeat();

		for await (const event of printer.printImage(lines)) {
			console.log(event);
			if (event.type === 'WRITE_LINE') {
				setHighlightColumn(event.line);
			} else if (event.type === 'END_PAGE') {
				setHighlightColumn(undefined);
			}
		}
	};

	const onEditorChange = useMemo(
		() =>
			debounce((code?: string) => {
				if (typeof code !== 'string') return;
				setCode(code);
			}, evalDelay),
		[evalDelay]
	);

	const applyDither = useMemo(() => {
		switch (ditherAlgorithm) {
			case 'atkinson':
				return atkinson;
			case 'bayer':
				return (image: ImageData) => bayer(image, ditherThreshold);
			case 'floydsteinberg':
				return floydsteinberg;
			case 'threshold':
				return (image: ImageData) => threshold(image, ditherThreshold);
			default:
				return bayer;
		}
	}, [ditherAlgorithm, ditherThreshold]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		setError(null);
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) return;

		try {
			const compiledOutput = compileJSX(code);

			(async () => {
				const fontRes = await fetch('/Geist-Regular.ttf');
				const font = await fontRes.arrayBuffer();
				const svg = await satori(compiledOutput, {
					width: canvas.width,
					height: canvas.height,
					fonts: [
						{
							name: 'Geist',
							data: geistNormal,
							weight: 400,
							style: 'normal',
						},
						{
							name: 'Geist',
							data: geistBold,
							weight: 700,
							style: 'normal',
						},
					],
				});
				const img = new Image();
				img.onload = () => {
					console.log(img);
					ctx.reset();
					ctx.fillStyle = 'white';
					ctx.fillRect(0, 0, canvas.width, canvas.height);
					ctx.drawImage(img, 0, 0);
				};
				const blob = new Blob([svg], { type: 'image/svg+xml' });
				img.src = URL.createObjectURL(blob);
			})();
		} catch (err) {
			setError(err);
		}
	}, [code]);

	return (
		<div className="flex flex-col items-center justify-center max-w-5xl">
			<Header />

			<Button
				type="button"
				className="cursor-pointer text-xl"
				onClick={print}
			>
				Print
			</Button>

			<div className="flex gap-2 p-4">
				<div className="flex flex-col gap-1 items-center">
					<h2 className="text-xl font-bold">Canvas</h2>
					<canvas
						className="rounded-2xl shadow-lg border bg-white"
						ref={canvasRef}
						width={dimensions.width}
						height={dimensions.height}
					/>
				</div>
				<div className="flex flex-col gap-1 items-center">
					<h2 className="text-xl font-bold">Preview</h2>
					<Preview
						className="rounded-2xl shadow-lg border bg-white"
						highlightColumn={highlightColumn}
						width={dimensions.width}
						height={dimensions.height}
						sourceRef={canvasRef}
						applyDither={applyDither}
					/>
				</div>
			</div>

			<div className="flex gap-2">
				<div>
					<Label htmlFor="ditherAlgorithm">Dither Algorithm</Label>
					<Select
						defaultValue={DEFAULT_DITHER_ALGORITHM}
						onValueChange={(v) => setDitherAlgorithm(v)}
					>
						<SelectTrigger
							id="ditherAlgorithm"
							className="w-[230px]"
						>
							<SelectValue
								defaultValue={DEFAULT_DITHER_ALGORITHM}
							/>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="atkinson">Atkinson</SelectItem>
							<SelectItem value="bayer">Bayer</SelectItem>
							<SelectItem value="floydsteinberg">
								Floyd-Steinberg
							</SelectItem>
							<SelectItem value="threshold">Threshold</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div>
					<Label htmlFor="ditherThreshold">Dither Threshold</Label>
					<Input
						id="ditherThreshold"
						type="number"
						defaultValue={128}
						min={0}
						max={255}
						onChange={(e) =>
							setDitherThreshold(Number(e.target.value))
						}
					/>
				</div>
			</div>

			{error ? String(error) : null}

			<Editor
				height={400}
				className="border shadow mt-4"
				defaultLanguage="typescript"
				defaultValue={code}
				theme={theme === 'light' ? 'light' : 'vs-dark'}
				options={{
					autoIndent: 'full',
					autoClosingBrackets: 'always',
					minimap: { enabled: false },
				}}
				onChange={onEditorChange}
				beforeMount={(monaco) => {
					console.log(monaco);
					monaco.languages.typescript.typescriptDefaults.setCompilerOptions(
						{
							jsx: monaco.languages.typescript.JsxEmit.React, // Enables JSX
							jsxFactory: 'React.createElement', // Set JSX factory (optional, can be replaced)
							allowJs: true, // Allow JavaScript
							target: monaco.languages.typescript.ScriptTarget
								.ESNext, // Modern JS
							moduleResolution:
								monaco.languages.typescript.ModuleResolutionKind
									.NodeJs,
							strict: true, // Enforce strict mode for better autocomplete
							allowNonTsExtensions: true,
							module: monaco.languages.typescript.ModuleKind
								.CommonJS,
							noEmit: true,
							typeRoots: ['node_modules/@types'],
							lib: ['DOM', 'DOM.Iterable', 'ES2022'],
						}
					);

					//console.log(csstypeDecl);
					monaco.languages.typescript.typescriptDefaults.addExtraLib(
						csstypeDecl,
						'node_modules/csstype/index.d.ts'
					);
					monaco.languages.typescript.typescriptDefaults.addExtraLib(
						reactGlobalDecl,
						'node_modules/@types/react/global.d.ts'
					);
					monaco.languages.typescript.typescriptDefaults.addExtraLib(
						reactIndexDecl,
						'node_modules/@types/react/index.d.ts'
					);
					monaco.languages.typescript.typescriptDefaults.addExtraLib(
						jsxRuntimeDecl,
						'node_modules/@types/react/jsx-runtime.d.ts'
					);
				}}
				onMount={(editor) => {
					//const vimMode = initVimMode(editor, document.getElementById('my-statusbar'))
				}}
			/>
		</div>
	);
}
