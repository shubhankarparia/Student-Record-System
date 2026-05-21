const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    initializeDatabase();
  }
});

// Helper for running queries with async/await
db.runAsync = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    this.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

db.getAsync = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    this.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

db.allAsync = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    this.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

async function initializeDatabase() {
  try {
    // Enable Foreign Keys support in SQLite
    await db.runAsync('PRAGMA foreign_keys = ON');

    // 1. Create Users Table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT CHECK(role IN ('admin', 'teacher', 'student')) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Create Courses Table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_name TEXT NOT NULL,
        course_code TEXT NOT NULL UNIQUE,
        duration TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Create Students Table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT,
        dob TEXT,
        gender TEXT CHECK(gender IN ('Male', 'Female', 'Other')),
        address TEXT,
        course_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
      )
    `);

    // 4. Create Teachers Table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS teachers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        department TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 5. Create Subjects Table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_name TEXT NOT NULL,
        course_id INTEGER,
        teacher_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
      )
    `);

    // 6. Create Marks Table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS marks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        marks REAL,
        exam_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
      )
    `);

    // 7. Create Attendance Table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        status TEXT CHECK(status IN ('Present', 'Absent', 'Late', 'Excused')) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
      )
    `);

    // Seed Default Data if users table is empty
    const userCount = await db.getAsync('SELECT COUNT(*) as count FROM users');
    if (userCount.count === 0) {
      console.log('Seeding initial data...');
      await seedDatabase();
    }
  } catch (error) {
    console.error('Database migration error:', error);
  }
}

async function seedDatabase() {
  const salt = await bcrypt.genSalt(10);
  
  // Seed passwords:
  // admin: admin123
  // teacher1 & teacher2: teacher123
  // student1 & student2: student123
  const adminHash = await bcrypt.hash('admin123', salt);
  const teacherHash = await bcrypt.hash('teacher123', salt);
  const studentHash = await bcrypt.hash('student123', salt);

  // 1. Insert Users
  await db.runAsync(`INSERT INTO users (username, password, role) VALUES ('admin', ?, 'admin')`, [adminHash]);
  await db.runAsync(`INSERT INTO users (username, password, role) VALUES ('teacher1', ?, 'teacher')`, [teacherHash]);
  await db.runAsync(`INSERT INTO users (username, password, role) VALUES ('teacher2', ?, 'teacher')`, [teacherHash]);
  await db.runAsync(`INSERT INTO users (username, password, role) VALUES ('student1', ?, 'student')`, [studentHash]);
  await db.runAsync(`INSERT INTO users (username, password, role) VALUES ('student2', ?, 'student')`, [studentHash]);

  // Retrieve user IDs
  const uAdmin = await db.getAsync("SELECT id FROM users WHERE username = 'admin'");
  const uTeacher1 = await db.getAsync("SELECT id FROM users WHERE username = 'teacher1'");
  const uTeacher2 = await db.getAsync("SELECT id FROM users WHERE username = 'teacher2'");
  const uStudent1 = await db.getAsync("SELECT id FROM users WHERE username = 'student1'");
  const uStudent2 = await db.getAsync("SELECT id FROM users WHERE username = 'student2'");

  // 2. Insert Courses
  await db.runAsync(`INSERT INTO courses (course_name, course_code, duration) VALUES ('Bachelor of Science in Computer Science', 'BSCS01', '4 Years')`);
  await db.runAsync(`INSERT INTO courses (course_name, course_code, duration) VALUES ('Master of Business Administration', 'MBA02', '2 Years')`);
  
  const cBSCS = await db.getAsync("SELECT id FROM courses WHERE course_code = 'BSCS01'");
  const cMBA = await db.getAsync("SELECT id FROM courses WHERE course_code = 'MBA02'");

  // 3. Insert Teachers
  await db.runAsync(`INSERT INTO teachers (user_id, name, email, department) VALUES (?, 'Dr. Sarah Connor', 'sarah.connor@university.edu', 'Computer Science')`, [uTeacher1.id]);
  await db.runAsync(`INSERT INTO teachers (user_id, name, email, department) VALUES (?, 'Prof. Charles Xavier', 'charles.xavier@university.edu', 'Business & Management')`, [uTeacher2.id]);

  const tSarah = await db.getAsync("SELECT id FROM teachers WHERE email = 'sarah.connor@university.edu'");
  const tCharles = await db.getAsync("SELECT id FROM teachers WHERE email = 'charles.xavier@university.edu'");

  // 4. Insert Students
  await db.runAsync(`INSERT INTO students (user_id, name, email, phone, dob, gender, address, course_id) VALUES (?, 'John Doe', 'john.doe@student.edu', '+1 555-0199', '2004-05-14', 'Male', '123 Cyberdyne Way', ?)`, [uStudent1.id, cBSCS.id]);
  await db.runAsync(`INSERT INTO students (user_id, name, email, phone, dob, gender, address, course_id) VALUES (?, 'Jane Smith', 'jane.smith@student.edu', '+1 555-0177', '2003-11-22', 'Female', '1407 Graymalkin Lane', ?)`, [uStudent2.id, cMBA.id]);

  const sJohn = await db.getAsync("SELECT id FROM students WHERE email = 'john.doe@student.edu'");
  const sJane = await db.getAsync("SELECT id FROM students WHERE email = 'jane.smith@student.edu'");

  // 5. Insert Subjects
  await db.runAsync(`INSERT INTO subjects (subject_name, course_id, teacher_id) VALUES ('Introduction to Algorithms', ?, ?)`, [cBSCS.id, tSarah.id]);
  await db.runAsync(`INSERT INTO subjects (subject_name, course_id, teacher_id) VALUES ('Database Management Systems', ?, ?)`, [cBSCS.id, tSarah.id]);
  await db.runAsync(`INSERT INTO subjects (subject_name, course_id, teacher_id) VALUES ('Strategic Management', ?, ?)`, [cMBA.id, tCharles.id]);

  const subAlgo = await db.getAsync("SELECT id FROM subjects WHERE subject_name = 'Introduction to Algorithms'");
  const subDBMS = await db.getAsync("SELECT id FROM subjects WHERE subject_name = 'Database Management Systems'");
  const subStrat = await db.getAsync("SELECT id FROM subjects WHERE subject_name = 'Strategic Management'");

  // 6. Seed Marks
  await db.runAsync(`INSERT INTO marks (student_id, subject_id, marks, exam_type) VALUES (?, ?, 88.5, 'Midterm')`, [sJohn.id, subAlgo.id]);
  await db.runAsync(`INSERT INTO marks (student_id, subject_id, marks, exam_type) VALUES (?, ?, 92.0, 'Finals')`, [sJohn.id, subAlgo.id]);
  await db.runAsync(`INSERT INTO marks (student_id, subject_id, marks, exam_type) VALUES (?, ?, 78.0, 'Midterm')`, [sJohn.id, subDBMS.id]);
  await db.runAsync(`INSERT INTO marks (student_id, subject_id, marks, exam_type) VALUES (?, ?, 85.5, 'Finals')`, [sJohn.id, subDBMS.id]);
  await db.runAsync(`INSERT INTO marks (student_id, subject_id, marks, exam_type) VALUES (?, ?, 91.0, 'Finals')`, [sJane.id, subStrat.id]);

  // 7. Seed Attendance
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const twoDaysAgo = new Date(Date.now() - 172800000).toISOString().split('T')[0];

  // John Doe Attendance
  await db.runAsync(`INSERT INTO attendance (student_id, subject_id, date, status) VALUES (?, ?, ?, 'Present')`, [sJohn.id, subAlgo.id, twoDaysAgo]);
  await db.runAsync(`INSERT INTO attendance (student_id, subject_id, date, status) VALUES (?, ?, ?, 'Present')`, [sJohn.id, subAlgo.id, yesterday]);
  await db.runAsync(`INSERT INTO attendance (student_id, subject_id, date, status) VALUES (?, ?, ?, 'Late')`, [sJohn.id, subAlgo.id, today]);
  await db.runAsync(`INSERT INTO attendance (student_id, subject_id, date, status) VALUES (?, ?, ?, 'Present')`, [sJohn.id, subDBMS.id, yesterday]);
  await db.runAsync(`INSERT INTO attendance (student_id, subject_id, date, status) VALUES (?, ?, ?, 'Absent')`, [sJohn.id, subDBMS.id, today]);

  // Jane Smith Attendance
  await db.runAsync(`INSERT INTO attendance (student_id, subject_id, date, status) VALUES (?, ?, ?, 'Present')`, [sJane.id, subStrat.id, yesterday]);
  await db.runAsync(`INSERT INTO attendance (student_id, subject_id, date, status) VALUES (?, ?, ?, 'Present')`, [sJane.id, subStrat.id, today]);

  console.log('Seeding successfully completed!');
}

module.exports = db;
