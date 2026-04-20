# Hướng dẫn cài đặt & build iOS trên Mac

## 1. Công cụ hệ thống

```bash
# Cài Homebrew (nếu chưa có)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Cài nvm để quản lý Node.js
brew install nvm

# Thêm vào ~/.zshrc hoặc ~/.bash_profile
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"

# Cài Node 18
nvm install 18
nvm use 18

# Cài Watchman (bắt buộc cho React Native trên Mac)
brew install watchman
```

---

## 2. Xcode

1. Cài **Xcode** từ App Store (dung lượng ~10GB, mất thời gian)
2. Mở Xcode → **Settings → Locations** → chọn **Command Line Tools** (chọn phiên bản mới nhất)
3. Chấp nhận license:

```bash
sudo xcodebuild -license accept
```

4. Cài CocoaPods:

```bash
sudo gem install cocoapods
# hoặc dùng brew
brew install cocoapods
```

---

## 3. EAS CLI & Expo CLI

```bash
npm install -g eas-cli expo-cli
```

Đăng nhập tài khoản Expo:

```bash
eas login
```

---

## 4. Cài dependencies của project

```bash
cd <thư-mục-project>
npm install
```

---

## 5. Tạo thư mục ios (lần đầu)

> Chỉ cần chạy 1 lần nếu chưa có thư mục `ios/`

```bash
npx expo prebuild --platform ios
```

---

## 6. Cài iOS native modules (CocoaPods)

```bash
cd ios
pod install
cd ..
```

> Chạy lại lệnh này mỗi khi thêm package native mới.

---

## 7. Chạy local trên Simulator

```bash
npx expo run:ios
```

---

## 8. Build IPA qua EAS (TestFlight / real device)

```bash
eas build --platform ios --profile preview
```

> Lần đầu EAS sẽ yêu cầu đăng nhập Apple Developer Account và tạo provisioning profile tự động.

---

## Lưu ý quan trọng

| Vấn đề | Chi tiết |
|---|---|
| Không dùng Expo Go | Project dùng `@react-native-voice/voice` — phải dùng development build |
| Node version | Cần **Node 18+** (project dùng Expo SDK 50) |
| Apple Developer | Cần tài khoản **Apple Developer ($99/năm)** để build real device / TestFlight |
| Simulator miễn phí | Chạy trên iOS Simulator không cần tài khoản Apple Developer |
| pod install chậm | Lần đầu có thể mất 5–15 phút |
