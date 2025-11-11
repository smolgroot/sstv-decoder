import SSTVDecoder from "@/components/SSTVDecoder";

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">SSTV Decoder</h1>
        <p className="text-gray-400 mb-8">
          Real-time Slow Scan Television signal decoder from microphone
        </p>
        <SSTVDecoder />
      </div>
    </main>
  );
}
