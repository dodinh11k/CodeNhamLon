// Lấy canvas và context
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Thiết lập kích thước canvas
canvas.width = 400;
canvas.height = 300;

// Vẽ một hình đơn giản
ctx.fillStyle = '#4CAF50';
ctx.fillRect(50, 50, 100, 100);

// Vẽ một vòng tròn
ctx.beginPath();
ctx.arc(250, 100, 50, 0, Math.PI * 2);
ctx.fillStyle = '#2196F3';
ctx.fill();

// In ra console (sẽ hiển thị trong trang)
console.log('Đã vẽ xong hình!');
console.log('Canvas size:', canvas.width, 'x', canvas.height);