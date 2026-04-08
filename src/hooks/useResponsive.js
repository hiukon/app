import { useState, useEffect } from 'react';
import { Dimensions } from 'react-native';

const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

export function useResponsive() {
    const [dimensions, setDimensions] = useState(Dimensions.get('window'));

    useEffect(() => {
        const subscription = Dimensions.addEventListener('change', ({ window }) => {
            setDimensions(window);
        });
        return () => subscription?.remove();
    }, []);

    const { width, height } = dimensions;
    const shortSide = Math.min(width, height);
    const longSide = Math.max(width, height);

    const isSmall = shortSide < 360;
    const isMedium = shortSide >= 360 && shortSide < 768;
    const isLarge = shortSide >= 768;
    const isTablet = shortSide >= 768;
    const isLandscape = width > height;

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const scale = (size) => clamp((shortSide / BASE_WIDTH) * size, size * 0.9, size * 1.35);
    const verticalScale = (size) => clamp((longSide / BASE_HEIGHT) * size, size * 0.9, size * 1.35);

    const fontSize = (small, medium, large) => {
        if (isSmall) return small;
        if (isMedium) return medium;
        return large;
    };

    const padding = (small, medium, large) => {
        if (isSmall) return small;
        if (isMedium) return medium;
        return large;
    };

    const margin = (small, medium, large) => {
        if (isSmall) return small;
        if (isMedium) return medium;
        return large;
    };

    const gridColumns = () => {
        if (isSmall) return 1;
        if (isMedium) return 2;
        return 3;
    };

    return {
        width,
        height,
        shortSide,
        longSide,
        isSmall,
        isMedium,
        isLarge,
        isTablet,
        isLandscape,
        scale,
        verticalScale,
        fontSize,
        padding,
        margin,
        gridColumns,
    };
}