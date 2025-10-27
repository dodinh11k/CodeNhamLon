const express = require("express");
const path = require("path");
const mainRoutes = require("./routes/main");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cấu hình view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Cấu hình static folder
app.use(express.static(path.join(__dirname, "public")));

// Sử dụng routes
app.use("/", mainRoutes);

// Error handling middleware
app.use((req, res, next) => {
  res.status(404).render('error', { 
    message: 'Trang không tồn tại',
    error: { status: 404 }
  });
});

app.use((err, req, res, next) => {
  res.status(err.status || 500).render('error', {
    message: err.message,
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Khởi chạy server
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
