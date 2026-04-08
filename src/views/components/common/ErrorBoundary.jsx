import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <View className="flex-1 justify-center items-center p-4 bg-gray-100">
                    <Text className="text-red-600 text-lg font-bold mb-2">Có lỗi xảy ra!</Text>
                    <Text className="text-gray-600 text-center mb-4">{this.state.error?.message}</Text>
                    <TouchableOpacity
                        onPress={() => this.setState({ hasError: false })}
                        className="bg-blue-600 px-6 py-2 rounded-lg"
                    >
                        <Text className="text-white font-semibold">Thử lại</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;