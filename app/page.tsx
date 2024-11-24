import React from 'react';

export default function Home() {
  return (
    <main className="flex flex-row min-h-screen w-full">
      <div className="w-1/4 bg-red-500">
        <h1 className="text-white p-4 text-2xl">红色区域</h1>
      </div>
      <div className="w-2/4 bg-yellow-500">
        <h1 className="text-black p-4 text-2xl">黄色区域</h1>
      </div>
      <div className="w-1/4 bg-blue-500">
        <h1 className="text-white p-4 text-2xl">蓝色区域</h1>
      </div>
    </main>
  );
} 