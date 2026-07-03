'use client';

import type {
  DragEventHandler,
  ImgHTMLAttributes,
  MouseEventHandler,
} from 'react';

type ProtectedImageProps = ImgHTMLAttributes<HTMLImageElement>;

export function ProtectedImage({
  className,
  draggable = false,
  onContextMenu,
  onDragStart,
  ...props
}: ProtectedImageProps) {
  const handleContextMenu: MouseEventHandler<HTMLImageElement> = (event) => {
    event.preventDefault();
    onContextMenu?.(event);
  };

  const handleDragStart: DragEventHandler<HTMLImageElement> = (event) => {
    event.preventDefault();
    onDragStart?.(event);
  };

  return (
    <img
      {...props}
      className={className ? `select-none ${className}` : 'select-none'}
      draggable={draggable}
      onContextMenu={handleContextMenu}
      onDragStart={handleDragStart}
    />
  );
}
