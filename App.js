import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/contexts/AuthContext';
import { useResponsive } from './src/hooks/useResponsive';
import DraggableChatBubble from './src/views/components/chat/DraggableChatBubble';
import HomeScreen from './src/views/screens/HomeScreen';
import ExploreScreen from './src/views/screens/ExploreScreen';
import InfoScreen from './src/views/screens/InfoScreen';
import AccountScreen from './src/views/screens/AccountScreen';

const Tab = createBottomTabNavigator();

export default function App() {
    const { scale, isTablet } = useResponsive();

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <AuthProvider>
                <NavigationContainer>
                    <View style={{ flex: 1 }}>
                        <Tab.Navigator
                            screenOptions={({ route }) => ({
                                tabBarIcon: ({ color, size }) => {
                                    const icons = {
                                        'Trang chủ': 'home',
                                        'Khám phá': 'explore',
                                        'Thông tin': 'info',
                                        'Tài khoản': 'person'
                                    };
                                    return <MaterialIcons name={icons[route.name]} size={size} color={color} />;
                                },
                                tabBarActiveTintColor: '#1d4ed8',
                                tabBarInactiveTintColor: '#d1d5db',
                                tabBarStyle: {
                                    backgroundColor: '#ffffff',
                                    borderTopWidth: 1,
                                    borderTopColor: '#f3f4f6',
                                    height: scale(isTablet ? 70 : 60),
                                    paddingBottom: scale(isTablet ? 12 : 8),
                                    paddingTop: scale(isTablet ? 12 : 8),
                                    position: 'relative',
                                    shadowColor: 'transparent',
                                },
                                tabBarLabelStyle: { fontSize: scale(isTablet ? 10 : 9), fontWeight: '600', marginTop: scale(2) },
                                tabBarItemStyle: { paddingVertical: scale(2) },
                                headerShown: false,
                            })}
                        >
                            <Tab.Screen name="Trang chủ" component={HomeScreen} />
                            <Tab.Screen name="Khám phá" component={ExploreScreen} />
                            <Tab.Screen name="Thông tin" component={InfoScreen} />
                            <Tab.Screen name="Tài khoản" component={AccountScreen} />
                        </Tab.Navigator>
                        <DraggableChatBubble />
                    </View>
                </NavigationContainer>
            </AuthProvider>
        </GestureHandlerRootView>
    );
}