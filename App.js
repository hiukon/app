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
                                tabBarActiveTintColor: '#2563eb',
                                tabBarInactiveTintColor: '#9ca3af',
                                tabBarStyle: {
                                    backgroundColor: '#ffffff',
                                    borderTopWidth: 0,
                                    marginHorizontal: scale(isTablet ? 20 : 10),
                                    marginBottom: scale(10),
                                    borderRadius: scale(20),
                                    height: scale(isTablet ? 74 : 66),
                                    paddingBottom: scale(8),
                                    paddingTop: scale(8),
                                    position: 'absolute',
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: -2 },
                                    shadowOpacity: 0.06,
                                    shadowRadius: 10,
                                    elevation: 8,
                                },
                                tabBarLabelStyle: { fontSize: scale(isTablet ? 12 : 11), fontWeight: '600' },
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