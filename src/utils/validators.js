export const validateEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
};

export const validatePhone = (phone) => {
    const regex = /(84|0[3|5|7|8|9])+([0-9]{8})\b/;
    return regex.test(phone);
};

export const validatePassword = (password) => {
    return password.length >= 6;
};

export const validateUsername = (username) => {
    return username.length >= 3;
};