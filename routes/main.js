const express = require("express");
const router = express.Router();
const fs = require("fs").promises;
const path = require("path");

// Middleware xử lý lỗi cho route
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Trang chủ: hiển thị danh sách file JS trong public/js
router.get("/", asyncHandler(async (req, res) => {
  const jsDir = path.join(__dirname, "../public/js");
  const files = await fs.readdir(jsDir);
  const jsFiles = files.filter(f => f.endsWith(".js"));
  res.render("index", { 
    files: jsFiles,
    title: 'Trang chủ'
  });
}));

// Trang Planet 3D
router.get("/planet", (req, res) => {
  res.render("planet", {
    title: "Planet 3D"
  });
});

// Trang xem chi tiết code
router.get("/view/:name", asyncHandler(async (req, res) => {
  const fileName = req.params.name;
  const filePath = path.join(__dirname, "../public/js", fileName);
  
  try {
    await fs.access(filePath);
    const code = await fs.readFile(filePath, "utf-8");
    // Nếu là heart-animation.js thì render trang chuyên dụng
    if (fileName === 'heart-animation.js') {
      return res.render('view_heart', {
        fileName,
        code,
        title: `Chi tiết: ${fileName}`
      });
    }
    // Nếu là planet-scene.js thì render trang chuyên dụng khác
    if (fileName === 'planet-scene.js') {
      return res.render('view_planet', {
        fileName,
        code,
        title: `Chi tiết: ${fileName}`
      });
    }

    res.render("view", { 
      fileName, 
      code,
      title: `Chi tiết: ${fileName}`
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).render('error', { 
        message: 'Không tìm thấy file',
        error: { status: 404 }
      });
    } else {
      throw error;
    }
  }
}));

module.exports = router;
