import { Dimensions, PixelRatio } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;

export const scaleWidth = (size) => (screenWidth / guidelineBaseWidth) * size;
export const scaleHeight = (size) => (screenHeight / guidelineBaseHeight) * size;
export const scaleFont = (size) => size * PixelRatio.getFontScale();

export const widthPercent = (percent) => (screenWidth * percent) / 100;
export const heightPercent = (percent) => (screenHeight * percent) / 100;

export const spacing = {
    xs: scaleWidth(4),
    sm: scaleWidth(8),
    md: scaleWidth(16),
    lg: scaleWidth(24),
    xl: scaleWidth(32),
    xxl: scaleWidth(48),
};

export const typography = {
    h1: scaleFont(32),
    h2: scaleFont(28),
    h3: scaleFont(24),
    h4: scaleFont(20),
    body: scaleFont(16),
    caption: scaleFont(14),
    small: scaleFont(12),
};