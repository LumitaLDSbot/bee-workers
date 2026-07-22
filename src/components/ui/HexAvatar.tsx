import { cn } from '@/lib/utils/cn';

interface HexAvatarProps {
  src?: string | null;
  alt?: string;
  size?: number;
  fallback?: string;
}

export function HexAvatar({ src, alt = 'Avatar', size = 56, fallback = 'BW' }: HexAvatarProps) {
  return (
    <div className="hex-clip flex items-center justify-center overflow-hidden bg-bee font-bold text-ink" style={{ width: size, height: size }}>
      {src ? <img src={src} alt={alt} className="h-full w-full object-cover" style={{ width: size, height: size }} /> : <span className={cn('text-sm')}>{fallback}</span>}
    </div>
  );
}
