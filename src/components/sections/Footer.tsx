import React from 'react';

const Footer: React.FC = () => {
  return (
    <div className="mt-8 text-center text-sm text-gray-500">
      <div className="inline-grid grid-cols-2 gap-x-8 gap-y-2 text-left mb-4">
        <div className="flex items-center">
          <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
          <span>MP3 up to 320kbps</span>
        </div>
        <div className="flex items-center">
          <div className="w-2 h-2 rounded-full bg-blue-500 mr-2"></div>
          <span>Playlist support</span>
        </div>
        <div className="flex items-center">
          <div className="w-2 h-2 rounded-full bg-purple-500 mr-2"></div>
          <span>Batch processing</span>
        </div>
        <div className="flex items-center">
          <div className="w-2 h-2 rounded-full bg-yellow-500 mr-2"></div>
          <span>Cross-platform</span>
        </div>
      </div>
      <div className="text-gray-400">
        Made by <span className="text-emerald-500">&lt;</span>MC<span className="text-emerald-500">/&gt;</span>
      </div>
    </div>
  );
};

export default Footer;
