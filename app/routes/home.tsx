import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage, Layer, Rect, Text, Circle, Line } from 'react-konva';
import debounce from 'debounce';
import Editor from '@monaco-editor/react';
import type Konva from 'konva';
import type { Route } from './+types/home';
import { PrinterClient } from '~/lib/printer';

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'Niimbot Label Maker' },
    { name: 'description', content: 'Label editor for Niimbot printers' },
  ];
}

var bayerThresholdMap = [
  [15, 135, 45, 165],
  [195, 75, 225, 105],
  [60, 180, 30, 150],
  [240, 120, 210, 90],
];

var lumR = [];
var lumG = [];
var lumB = [];
for (var i = 0; i < 256; i++) {
  lumR[i] = i * 0.299;
  lumG[i] = i * 0.587;
  lumB[i] = i * 0.114;
}

function monochrome(imageData, threshold, type) {
  var imageDataLength = imageData.data.length;

  // Greyscale luminance (sets r pixels to luminance of rgb)
  for (var i = 0; i <= imageDataLength; i += 4) {
    imageData.data[i] = Math.floor(
      lumR[imageData.data[i]] +
      lumG[imageData.data[i + 1]] +
      lumB[imageData.data[i + 2]]
    );
  }

  var w = imageData.width;
  var newPixel, err;

  for (
    var currentPixel = 0;
    currentPixel <= imageDataLength;
    currentPixel += 4
  ) {
    if (type === 'none') {
      // No dithering
      imageData.data[currentPixel] =
        imageData.data[currentPixel] < threshold ? 0 : 255;
    } else if (type === 'bayer') {
      // 4x4 Bayer ordered dithering algorithm
      var x = (currentPixel / 4) % w;
      var y = Math.floor(currentPixel / 4 / w);
      var map = Math.floor(
        (imageData.data[currentPixel] + bayerThresholdMap[x % 4][y % 4]) / 2
      );
      imageData.data[currentPixel] = map < threshold ? 0 : 255;
    } else if (type === 'floydsteinberg') {
      // Floyd–Steinberg dithering algorithm
      newPixel = imageData.data[currentPixel] < 129 ? 0 : 255;
      err = Math.floor((imageData.data[currentPixel] - newPixel) / 16);
      imageData.data[currentPixel] = newPixel;

      imageData.data[currentPixel + 4] += err * 7;
      imageData.data[currentPixel + 4 * w - 4] += err * 3;
      imageData.data[currentPixel + 4 * w] += err * 5;
      imageData.data[currentPixel + 4 * w + 4] += err * 1;
    } else {
      // Bill Atkinson's dithering algorithm
      newPixel = imageData.data[currentPixel] < 129 ? 0 : 255;
      err = Math.floor((imageData.data[currentPixel] - newPixel) / 8);
      imageData.data[currentPixel] = newPixel;

      imageData.data[currentPixel + 4] += err;
      imageData.data[currentPixel + 8] += err;
      imageData.data[currentPixel + 4 * w - 4] += err;
      imageData.data[currentPixel + 4 * w] += err;
      imageData.data[currentPixel + 4 * w + 4] += err;
      imageData.data[currentPixel + 8 * w] += err;
    }

    // Set g and b pixels equal to r
    imageData.data[currentPixel + 1] = imageData.data[currentPixel + 2] =
      imageData.data[currentPixel];
  }

  return imageData;
}


export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [code, setCode] = useState(`const canvas = document.querySelector('canvas');
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

  const print = async () => {
    console.log('print');
  };

  const onEditorChange = useCallback(debounce((code?: string) => {
    if (typeof code !== 'string') return;
    setCode(code);
  }, 500), []);

  useEffect(() => {
    if (!canvasRef.current) return;
    setError(null);
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.reset();
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    try {
      // biome-ignore lint/security/noGlobalEval: <explanation>
      // biome-ignore lint/style/noCommaOperator: <explanation>
      (0, eval)(code);
    } catch (err) {
      setError(err);
    }

    setTimeout(async () => {
      const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      monochrome(imageData, 0.5, 'atkinson');

      const bits: HTMLCanvasElement | null = document.querySelector(".preview");
      if (!bits) throw new Error("Failed to get bits canvas");
      bits.width = canvasRef.current.width;
      bits.height = canvasRef.current.height;
      const bitsCtx = bits.getContext("2d");
      if (!bitsCtx) throw new Error("Failed to get 2d context");
      bitsCtx.putImageData(imageData, 0, 0);

      // Rotate 90 degrees
      const lines: (0 | 1)[][] = new Array(canvasRef.current.width);
      for (let y = 0; y < canvasRef.current.width; y++) {
        const line: (0 | 1)[] = new Array(canvasRef.current.height);
        for (let x = 0; x < canvasRef.current.height; x++) {
          const pixel = imageData.data[y * canvasRef.current.width * 4 + x * 4 + 0];
          line[x] = pixel > 128 ? 0 : 1;
        }
        lines[y] = line;
      }

      const printer = await PrinterClient.connect("D11");
      printer.startHeartbeat();
      //console.log(await printer.getInfo(InfoEnum.BATTERY));
      //console.log(await printer.getInfo(InfoEnum.SOFTVERSION));
      //console.log(await printer.getInfo(InfoEnum.HARDVERSION));
      //console.log(await printer.getInfo(InfoEnum.DEVICESERIAL));

      for await (const event of printer.printImage(lines)) {
        console.log(event);
      }
    }, 100);
  }, [code]);

  return (
    <div className='flex flex-col items-center justify-center h-screen'>
      <button
        type="button"
        className="border-2 border-amber-300"
        onClick={print}
      >
        Print
      </button>
      <div className='flex gap-2'>
        <canvas className='bg-white rounded-2xl' ref={canvasRef} width={dimensions.width} height={dimensions.height} />
        <canvas className='preview bg-white rounded-2xl' width={dimensions.width} height={dimensions.height} />
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
        height="400px"
        defaultLanguage="typescript"
        defaultValue={code}
        theme="vs-dark"
        options={{ minimap: { enabled: false } }}
        onChange={onEditorChange}
      />
    </div>
  );
}
