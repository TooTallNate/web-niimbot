import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Rect, Text, Circle, Line } from 'react-konva';
import debounce from 'debounce';
import Editor from '@monaco-editor/react';
import type Konva from 'konva';
import type { Route } from './+types/home';
import { PrinterClient } from '~/lib/printer';
import {
	atkinson,
	bayer,
	floydsteinberg,
	grayscale,
	threshold,
} from '~/lib/monochrome';
import { Preview } from '~/components/preview';

export function meta(_: Route.MetaArgs) {
	return [
		{ title: 'Niimbot Label Maker' },
		{ name: 'description', content: 'Label editor for Niimbot printers' },
	];
}

export default function App() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [code, setCode] =
		useState(`const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

// Use the Canvas API to create your label
ctx.font = '24px sans-serif';
ctx.fillStyle = 'black';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('Hello World', canvas.width / 2, canvas.height / 2);
`);
	const [error, setError] = useState<unknown>(null);
	const [dimensions, setDimensions] = useState({ width: 313, height: 96 });
	const [evalDelay, setEvalDelay] = useState(500);

	const print = async () => {
		console.log('print');
	};

	const onEditorChange = useMemo(
		() =>
			debounce((code?: string) => {
				if (typeof code !== 'string') return;
				setCode(code);
			}, evalDelay),
		[evalDelay]
	);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		setError(null);
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		ctx.reset();
		ctx.fillStyle = 'white';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		try {
			// biome-ignore lint/security/noGlobalEval: <explanation>
			// biome-ignore lint/style/noCommaOperator: <explanation>
			(0, eval)(code);
		} catch (err) {
			setError(err);
		}
	}, [code]);

	return (
		<div className="flex flex-col items-center justify-center h-screen">
			<button
				type="button"
				className="border-2 border-amber-300"
				onClick={print}
			>
				Print
			</button>
			<div className="flex gap-2">
				<div className="flex flex-col gap-1 items-center">
					<h2 className="text-xl font-bold">Code</h2>
					<canvas
						className="bg-white rounded-2xl"
						ref={canvasRef}
						width={dimensions.width}
						height={dimensions.height}
					/>
				</div>
				<div className="flex flex-col gap-1 items-center">
					<h2 className="text-xl font-bold">Preview</h2>
					<Preview
						className="bg-white rounded-2xl"
						width={dimensions.width}
						height={dimensions.height}
						sourceRef={canvasRef}
						applyDither={atkinson}
					/>
				</div>
			</div>
			{/*
      <Stage
        width={240}
        height={96}
        className="inline-block bg-white"
        ref={stageRef}
      >
        <Layer>
          <Text text="Some text on canvas" fontSize={15} draggable />
          <Rect
            x={20}
            y={50}
            width={100}
            height={100}
            fill="red"
            shadowBlur={10}
            draggable
          />
          <Circle x={200} y={100} radius={50} fill="green" />
          <Line
            x={20}
            y={200}
            points={[0, 0, 100, 0, 100, 100]}
            tension={0.5}
            closed
            stroke="black"
            fillLinearGradientStartPoint={{ x: -50, y: -50 }}
            fillLinearGradientEndPoint={{ x: 50, y: 50 }}
            fillLinearGradientColorStops={[0, 'red', 1, 'yellow']}
          />
        </Layer>
      </Stage>
      */}
			{error ? String(error) : null}
			<Editor
				height={400}
				defaultLanguage="typescript"
				defaultValue={code}
				theme="vs-dark"
				options={{ minimap: { enabled: false } }}
				onChange={onEditorChange}
			/>
		</div>
	);
}
