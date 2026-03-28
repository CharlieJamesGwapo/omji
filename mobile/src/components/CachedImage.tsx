import React from 'react';
import { Image } from 'expo-image';
import { StyleProp, ImageStyle } from 'react-native';

interface CachedImageProps {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  placeholder?: string;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  transition?: number;
}

const blurhash = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

export default function CachedImage({ uri, style, placeholder, contentFit = 'cover', transition = 200 }: CachedImageProps) {
  if (!uri) return null;

  return (
    <Image
      source={{ uri }}
      style={style}
      placeholder={placeholder || blurhash}
      contentFit={contentFit}
      transition={transition}
      cachePolicy="memory-disk"
    />
  );
}
