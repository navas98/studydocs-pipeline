import type { HTMLAttributes } from 'react';

export default function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`glass rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-[border-color,box-shadow,transform] duration-300 hover:border-white/[0.14] hover:shadow-[0_16px_40px_rgba(0,0,0,0.45)] ${className}`}
      {...props}
    />
  );
}
