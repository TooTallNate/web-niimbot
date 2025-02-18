import { ModeToggle } from '~/components/mode-toggle';

export function Header() {
	return (
		<header className="p-2 flex justify-around w-screen">
			<h1 className="text-xl font-bold">Niimbot Label Maker</h1>
			<ModeToggle />
		</header>
	);
}
