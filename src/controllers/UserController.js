import DataService from '../services/DataService';

class UserController {
    async loadCurrentUser() {
        try {
            const response = await DataService.getUserInfo();
            if (!response.success) {
                return { success: false, error: response.error || 'Không thể tải thông tin người dùng' };
            }

            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

export default new UserController();
