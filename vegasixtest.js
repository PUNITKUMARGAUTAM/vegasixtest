const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");

dotenv.config();
const app = express();
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Ensure 'uploads' folder exists and serve it statically
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use("/uploads", express.static(uploadsDir));

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage });

// MongoDB connection
mongoose.connect("mongodb://127.0.0.1:27017/vegatest", {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("Database connected"))
  .catch((err) => console.log(err));

// Models
const User = mongoose.model("User", new mongoose.Schema({
  email: String,
  password: String,
  profileImage: String
}));

const Blog = mongoose.model("Blog", new mongoose.Schema({
  title: String,
  image: String,
  description: String,
  createdBy: String,
  comments: [{ text: String, replies: [String] }]
}));

// Auth Middleware
function authenticateToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect("/login");

  jwt.verify(token, "secret", (err, user) => {
    if (err) return res.redirect("/login");
    req.user = user;
    next();
  });
}

// Routes
app.get("/", (req, res) => res.redirect("/login"));

app.get("/signup", (req, res) => res.render("signup"));
app.get("/login", (req, res) => res.render("login"));

app.post("/signup", upload.single("profileImage"), async (req, res) => {
  try {
    const { email, password } = req.body;
    const profileImage = req.file.filename;
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({ email, password: hashedPassword, profileImage });
    await user.save();

    res.redirect("/login");
  } catch (err) {
    console.error(err);
    res.status(500).send("Signup error");
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.send("Invalid credentials");
  }
  const token = jwt.sign({ id: user._id }, "secret");
  res.cookie("token", token).redirect("/dashboard");
});

app.get("/dashboard", authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.id);
  const blogs = await Blog.find({ createdBy: user.email });
  res.render("dashboard", { user, blogs });
});

app.post("/blog/create", authenticateToken, upload.single("image"), async (req, res) => {
  const { title, description } = req.body;
  const image = req.file?.filename;
  const user = await User.findById(req.user.id);
  await Blog.create({ title, image, description, createdBy: user.email });
  res.redirect("/dashboard");
});

app.get("/blog/edit/:id", authenticateToken, async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  res.render("edit", { blog });
});

app.post("/blog/update/:id", authenticateToken, upload.single("image"), async (req, res) => {
  const { title, description } = req.body;
  const blog = await Blog.findById(req.params.id);

  if (req.file) {
    if (blog.image && fs.existsSync(path.join(uploadsDir, blog.image))) {
      fs.unlinkSync(path.join(uploadsDir, blog.image));
    }
    blog.image = req.file.filename;
  }
  blog.title = title;
  blog.description = description;
  await blog.save();
  res.redirect("/dashboard");
});

app.get("/blog/delete/:id", authenticateToken, async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  if (blog.image && fs.existsSync(path.join(uploadsDir, blog.image))) {
    fs.unlinkSync(path.join(uploadsDir, blog.image));
  }
  await blog.deleteOne();
  res.redirect("/dashboard");
});

app.get("/blog/view/:id", authenticateToken, async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  res.render("view", { blog });
});

app.post("/blog/comment/:id", authenticateToken, async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  blog.comments.push({ text: req.body.text, replies: [] });
  await blog.save();
  res.redirect("/blog/view/" + req.params.id);
});

app.post("/blog/reply/:id/:commentIndex", authenticateToken, async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  blog.comments[req.params.commentIndex].replies.push(req.body.reply);
  await blog.save();
  res.redirect("/blog/view/" + req.params.id);
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
