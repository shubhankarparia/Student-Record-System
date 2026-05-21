const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { requireAuth, requireRole } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Body Parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session Setup
app.use(session({
  secret: 'srms-node-secret-key-premium-experience',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 2 } // 2 hours
}));

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Template Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// Set local variables for dynamic header menu
app.use(async (req, res, next) => {
  res.locals.user = req.session.userId ? {
    id: req.session.userId,
    username: req.session.username,
    role: req.session.role,
    name: req.session.name
  } : null;
  res.locals.activePath = req.path;
  next();
});

// Helper for dynamic grades calculation
function calculateGrade(score) {
  if (score >= 90) return { letter: 'A+', class: 'grade-ap' };
  if (score >= 80) return { letter: 'A', class: 'grade-a' };
  if (score >= 70) return { letter: 'B', class: 'grade-b' };
  if (score >= 60) return { letter: 'C', class: 'grade-c' };
  if (score >= 50) return { letter: 'D', class: 'grade-d' };
  return { letter: 'F', class: 'grade-f' };
}

// ---------------------- GUEST ROUTES ----------------------

// Landing page
app.get('/', (req, res) => {
  if (req.session.userId) {
    if (req.session.role === 'admin') return res.redirect('/admin/dashboard');
    if (req.session.role === 'teacher') return res.redirect('/teacher/dashboard');
    if (req.session.role === 'student') return res.redirect('/student/dashboard');
  }
  res.render('index', { title: 'Welcome to SRMS' });
});

// Login Page
app.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/');
  }
  res.render('login', { title: 'Portal Login', error: null });
});

// Login Handler
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('login', { title: 'Portal Login', error: 'Please enter all fields.' });
  }

  try {
    const user = await db.getAsync('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (!user) {
      return res.render('login', { title: 'Portal Login', error: 'Invalid username or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render('login', { title: 'Portal Login', error: 'Invalid username or password.' });
    }

    // Load full details based on role
    let name = 'User';
    let profileId = null;

    if (user.role === 'teacher') {
      const teacher = await db.getAsync('SELECT id, name FROM teachers WHERE user_id = ?', [user.id]);
      if (teacher) {
        name = teacher.name;
        profileId = teacher.id;
      }
    } else if (user.role === 'student') {
      const student = await db.getAsync('SELECT id, name FROM students WHERE user_id = ?', [user.id]);
      if (student) {
        name = student.name;
        profileId = student.id;
      }
    } else {
      name = 'Administrator';
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.name = name;
    req.session.profileId = profileId;

    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.render('login', { title: 'Portal Login', error: 'Database connection failed.' });
  }
});

// Logout Handler
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});


// ---------------------- ADMIN ROUTES ----------------------

// Admin Dashboard
app.get('/admin/dashboard', requireRole('admin'), async (req, res) => {
  try {
    const students = await db.getAsync('SELECT COUNT(*) as count FROM students');
    const teachers = await db.getAsync('SELECT COUNT(*) as count FROM teachers');
    const courses = await db.getAsync('SELECT COUNT(*) as count FROM courses');

    // Chart Data: Students per course
    const enrollmentData = await db.allAsync(`
      SELECT c.course_code, COUNT(s.id) as count 
      FROM courses c 
      LEFT JOIN students s ON s.course_id = c.id 
      GROUP BY c.id
    `);

    // Latest activities
    const recentStudents = await db.allAsync(`
      SELECT s.*, c.course_name 
      FROM students s 
      LEFT JOIN courses c ON s.course_id = c.id 
      ORDER BY s.created_at DESC LIMIT 5
    `);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats: {
        students: students.count,
        teachers: teachers.count,
        courses: courses.count
      },
      chartData: enrollmentData,
      recentStudents
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Manage Courses
app.get('/admin/courses', requireRole('admin'), async (req, res) => {
  try {
    const courses = await db.allAsync('SELECT * FROM courses ORDER BY created_at DESC');
    res.render('admin/courses', { title: 'Manage Courses', courses, success: null, error: null });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Add Course
app.post('/admin/courses/add', requireRole('admin'), async (req, res) => {
  const { course_name, course_code, duration } = req.body;
  try {
    await db.runAsync(
      'INSERT INTO courses (course_name, course_code, duration) VALUES (?, ?, ?)',
      [course_name.trim(), course_code.trim(), duration.trim()]
    );
    const courses = await db.allAsync('SELECT * FROM courses ORDER BY created_at DESC');
    res.render('admin/courses', { title: 'Manage Courses', courses, success: 'Course added successfully.', error: null });
  } catch (err) {
    const courses = await db.allAsync('SELECT * FROM courses ORDER BY created_at DESC');
    const errorMsg = err.message.includes('UNIQUE') ? 'Course Code already exists!' : err.message;
    res.render('admin/courses', { title: 'Manage Courses', courses, success: null, error: errorMsg });
  }
});

// Delete Course
app.post('/admin/courses/delete/:id', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    await db.runAsync('DELETE FROM courses WHERE id = ?', [id]);
    res.redirect('/admin/courses');
  } catch (err) {
    const courses = await db.allAsync('SELECT * FROM courses ORDER BY created_at DESC');
    res.render('admin/courses', { title: 'Manage Courses', courses, success: null, error: 'Cannot delete course: Enrolled students or active subjects exist.' });
  }
});

// Manage Teachers & Subject Assignments
app.get('/admin/teachers', requireRole('admin'), async (req, res) => {
  try {
    const teachers = await db.allAsync(`
      SELECT t.*, u.username, 
             GROUP_CONCAT(sub.subject_name, ', ') as subjects 
      FROM teachers t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN subjects sub ON sub.teacher_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);
    const courses = await db.allAsync('SELECT * FROM courses ORDER BY course_name');
    res.render('admin/teachers', { title: 'Manage Teachers', teachers, courses, success: null, error: null });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Add Teacher
app.post('/admin/teachers/add', requireRole('admin'), async (req, res) => {
  const { name, email, department, username, password } = req.body;
  const courses = await db.allAsync('SELECT * FROM courses ORDER BY course_name');
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Transaction
    await db.runAsync('BEGIN TRANSACTION');
    const userResult = await db.runAsync('INSERT INTO users (username, password, role) VALUES (?, ?, "teacher")', [username.trim(), hashedPassword]);
    const userId = userResult.lastID;

    await db.runAsync('INSERT INTO teachers (user_id, name, email, department) VALUES (?, ?, ?, ?)', [userId, name.trim(), email.trim(), department.trim()]);
    await db.runAsync('COMMIT');

    const teachers = await db.allAsync(`
      SELECT t.*, u.username, GROUP_CONCAT(sub.subject_name, ', ') as subjects 
      FROM teachers t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN subjects sub ON sub.teacher_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);
    res.render('admin/teachers', { title: 'Manage Teachers', teachers, courses, success: 'Teacher registered successfully.', error: null });
  } catch (err) {
    await db.runAsync('ROLLBACK');
    const teachers = await db.allAsync(`
      SELECT t.*, u.username, GROUP_CONCAT(sub.subject_name, ', ') as subjects 
      FROM teachers t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN subjects sub ON sub.teacher_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);
    const errorMsg = err.message.includes('UNIQUE') ? 'Username or Email already registered!' : err.message;
    res.render('admin/teachers', { title: 'Manage Teachers', teachers, courses, success: null, error: errorMsg });
  }
});

// Assign Subject to Teacher
app.post('/admin/teachers/assign-subject', requireRole('admin'), async (req, res) => {
  const { teacher_id, subject_name, course_id } = req.body;
  const courses = await db.allAsync('SELECT * FROM courses ORDER BY course_name');
  try {
    await db.runAsync(
      'INSERT INTO subjects (subject_name, course_id, teacher_id) VALUES (?, ?, ?)',
      [subject_name.trim(), course_id, teacher_id]
    );

    const teachers = await db.allAsync(`
      SELECT t.*, u.username, GROUP_CONCAT(sub.subject_name, ', ') as subjects 
      FROM teachers t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN subjects sub ON sub.teacher_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);
    res.render('admin/teachers', { title: 'Manage Teachers', teachers, courses, success: 'Subject assigned successfully.', error: null });
  } catch (err) {
    const teachers = await db.allAsync(`
      SELECT t.*, u.username, GROUP_CONCAT(sub.subject_name, ', ') as subjects 
      FROM teachers t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN subjects sub ON sub.teacher_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);
    res.render('admin/teachers', { title: 'Manage Teachers', teachers, courses, success: null, error: err.message });
  }
});

// Delete Teacher
app.post('/admin/teachers/delete/:id', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const teacher = await db.getAsync('SELECT user_id FROM teachers WHERE id = ?', [id]);
    if (teacher) {
      await db.runAsync('DELETE FROM users WHERE id = ?', [teacher.user_id]);
    }
    res.redirect('/admin/teachers');
  } catch (err) {
    res.status(500).send('Failed to delete teacher record.');
  }
});

// Manage Students
app.get('/admin/students', requireRole('admin'), async (req, res) => {
  try {
    const students = await db.allAsync(`
      SELECT s.*, c.course_name, u.username 
      FROM students s 
      LEFT JOIN courses c ON s.course_id = c.id
      JOIN users u ON s.user_id = u.id 
      ORDER BY s.created_at DESC
    `);
    const courses = await db.allAsync('SELECT * FROM courses ORDER BY course_name');
    res.render('admin/students', { title: 'Manage Students', students, courses, success: null, error: null });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Add Student
app.post('/admin/students/add', requireRole('admin'), async (req, res) => {
  const { name, email, phone, dob, gender, address, course_id, username, password } = req.body;
  const courses = await db.allAsync('SELECT * FROM courses ORDER BY course_name');
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await db.runAsync('BEGIN TRANSACTION');
    const userResult = await db.runAsync('INSERT INTO users (username, password, role) VALUES (?, ?, "student")', [username.trim(), hashedPassword]);
    const userId = userResult.lastID;

    await db.runAsync(
      `INSERT INTO students (user_id, name, email, phone, dob, gender, address, course_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, name.trim(), email.trim(), phone.trim(), dob || null, gender || null, address.trim(), course_id || null]
    );
    await db.runAsync('COMMIT');

    const students = await db.allAsync(`
      SELECT s.*, c.course_name, u.username 
      FROM students s 
      LEFT JOIN courses c ON s.course_id = c.id
      JOIN users u ON s.user_id = u.id 
      ORDER BY s.created_at DESC
    `);
    res.render('admin/students', { title: 'Manage Students', students, courses, success: 'Student enrolled successfully.', error: null });
  } catch (err) {
    await db.runAsync('ROLLBACK');
    const students = await db.allAsync(`
      SELECT s.*, c.course_name, u.username 
      FROM students s 
      LEFT JOIN courses c ON s.course_id = c.id
      JOIN users u ON s.user_id = u.id 
      ORDER BY s.created_at DESC
    `);
    const errorMsg = err.message.includes('UNIQUE') ? 'Username or Email already registered!' : err.message;
    res.render('admin/students', { title: 'Manage Students', students, courses, success: null, error: errorMsg });
  }
});

// Delete Student
app.post('/admin/students/delete/:id', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const student = await db.getAsync('SELECT user_id FROM students WHERE id = ?', [id]);
    if (student) {
      await db.runAsync('DELETE FROM users WHERE id = ?', [student.user_id]);
    }
    res.redirect('/admin/students');
  } catch (err) {
    res.status(500).send('Failed to delete student.');
  }
});


// ---------------------- TEACHER ROUTES ----------------------

// ---------------------- TEACHER ROUTES ----------------------

// Teacher Dashboard
app.get('/teacher/dashboard', requireRole('teacher'), async (req, res) => {
  try {
    const teacherId = req.session.profileId;

    const subjects = await db.allAsync(`
      SELECT s.*, c.course_name
      FROM subjects s
      LEFT JOIN courses c ON s.course_id = c.id
      WHERE s.teacher_id = ?
      ORDER BY s.subject_name
    `, [teacherId]);

    let studentCount = 0;

    for (const sub of subjects) {
      const result = await db.getAsync(
        'SELECT COUNT(*) as count FROM students WHERE course_id = ?',
        [sub.course_id]
      );

      studentCount += result.count;
    }

    res.render('teacher/dashboard', {
      title: 'Teacher Dashboard',
      subjects,
      studentCount
    });

  } catch (err) {
    console.error(err);
    res.status(500).send(err.stack);
  }
});


// ---------------------- ATTENDANCE SUBJECT LIST ----------------------

app.get('/teacher/attendance', requireRole('teacher'), async (req, res) => {

  try {

    const teacherId = req.session.profileId;

    const subjects = await db.allAsync(`
      SELECT s.*, c.course_name
      FROM subjects s
      LEFT JOIN courses c ON s.course_id = c.id
      WHERE s.teacher_id = ?
      ORDER BY s.subject_name
    `, [teacherId]);

    res.render('teacher/attendance-list', {
      title: 'Attendance Management',
      subjects
    });

  } catch (err) {

    console.error(err);
    res.status(500).send(err.stack);

  }

});


// ---------------------- MARKS SUBJECT LIST ----------------------

app.get('/teacher/marks', requireRole('teacher'), async (req, res) => {

  try {

    const teacherId = req.session.profileId;

    const subjects = await db.allAsync(`
      SELECT s.*, c.course_name
      FROM subjects s
      LEFT JOIN courses c ON s.course_id = c.id
      WHERE s.teacher_id = ?
      ORDER BY s.subject_name
    `, [teacherId]);

    res.render('teacher/marks-list', {
      title: 'Marks Management',
      subjects
    });

  } catch (err) {

    console.error(err);
    res.status(500).send(err.stack);

  }

});


// ---------------------- RECORD ATTENDANCE PAGE ----------------------

app.get('/teacher/attendance/:subjectId', requireRole('teacher'), async (req, res) => {

  const { subjectId } = req.params;

  try {

    const subject = await db.getAsync(`
      SELECT *
      FROM subjects
      WHERE id = ? AND teacher_id = ?
    `, [subjectId, req.session.profileId]);

    if (!subject) {
      return res.status(404).send('Subject not found.');
    }

    const students = await db.allAsync(`
      SELECT *
      FROM students
      WHERE course_id = ?
      ORDER BY name
    `, [subject.course_id]);

    const today = new Date().toISOString().split('T')[0];

    const attendanceData = await db.allAsync(`
      SELECT *
      FROM attendance
      WHERE subject_id = ? AND date = ?
    `, [subjectId, today]);

    const attendanceMap = {};

    attendanceData.forEach(record => {
      attendanceMap[record.student_id] = record.status;
    });

    res.render('teacher/attendance', {
      title: 'Record Attendance',
      subject,
      students,
      date: today,
      attendanceMap,
      success: null
    });

  } catch (err) {

    console.error(err);
    res.status(500).send(err.stack);

  }

});


// ---------------------- SAVE ATTENDANCE ----------------------

app.post('/teacher/attendance/:subjectId', requireRole('teacher'), async (req, res) => {

  const { subjectId } = req.params;

  const {
    date,
    attendance
  } = req.body;

  try {

    const subject = await db.getAsync(`
      SELECT *
      FROM subjects
      WHERE id = ? AND teacher_id = ?
    `, [subjectId, req.session.profileId]);

    if (!subject) {
      return res.status(404).send('Subject not found.');
    }

    const students = await db.allAsync(`
      SELECT id
      FROM students
      WHERE course_id = ?
    `, [subject.course_id]);

    await db.runAsync('BEGIN TRANSACTION');

    for (const student of students) {

      const status =
        attendance && attendance[student.id]
          ? attendance[student.id]
          : 'Absent';

      const existing = await db.getAsync(`
        SELECT id
        FROM attendance
        WHERE student_id = ?
        AND subject_id = ?
        AND date = ?
      `, [student.id, subjectId, date]);

      if (existing) {

        await db.runAsync(`
          UPDATE attendance
          SET status = ?
          WHERE id = ?
        `, [status, existing.id]);

      } else {

        await db.runAsync(`
          INSERT INTO attendance
          (student_id, subject_id, date, status)
          VALUES (?, ?, ?, ?)
        `, [student.id, subjectId, date, status]);

      }

    }

    await db.runAsync('COMMIT');

    const updatedAttendance = await db.allAsync(`
      SELECT *
      FROM attendance
      WHERE subject_id = ?
      AND date = ?
    `, [subjectId, date]);

    const attendanceMap = {};

    updatedAttendance.forEach(record => {
      attendanceMap[record.student_id] = record.status;
    });

    const studentsList = await db.allAsync(`
      SELECT *
      FROM students
      WHERE course_id = ?
      ORDER BY name
    `, [subject.course_id]);

    res.render('teacher/attendance', {
      title: 'Record Attendance',
      subject,
      students: studentsList,
      date,
      attendanceMap,
      success: 'Attendance saved successfully!'
    });

  } catch (err) {

    console.error(err);

    await db.runAsync('ROLLBACK');

    res.status(500).send(err.stack);

  }

});


// ---------------------- MANAGE MARKS PAGE ----------------------

app.get('/teacher/marks/:subjectId', requireRole('teacher'), async (req, res) => {

  const { subjectId } = req.params;

  try {

    const subject = await db.getAsync(`
      SELECT *
      FROM subjects
      WHERE id = ?
      AND teacher_id = ?
    `, [subjectId, req.session.profileId]);

    if (!subject) {
      return res.status(404).send('Subject not found.');
    }

    const students = await db.allAsync(`
      SELECT *
      FROM students
      WHERE course_id = ?
      ORDER BY name
    `, [subject.course_id]);

    const marksData = await db.allAsync(`
      SELECT *
      FROM marks
      WHERE subject_id = ?
    `, [subjectId]);

    const marksMap = {};

    marksData.forEach(record => {

      if (!marksMap[record.student_id]) {
        marksMap[record.student_id] = {};
      }

      marksMap[record.student_id][record.exam_type] = record.marks;

    });

    res.render('teacher/marks', {
      title: 'Gradebook',
      subject,
      students,
      marksMap,
      success: null
    });

  } catch (err) {

    console.error(err);
    res.status(500).send(err.stack);

  }

});


// ---------------------- SAVE MARKS ----------------------

app.post('/teacher/marks/:subjectId', requireRole('teacher'), async (req, res) => {

  const { subjectId } = req.params;

  const {
    midterm,
    finals
  } = req.body;

  try {

    const subject = await db.getAsync(`
      SELECT *
      FROM subjects
      WHERE id = ?
      AND teacher_id = ?
    `, [subjectId, req.session.profileId]);

    if (!subject) {
      return res.status(404).send('Subject not found.');
    }

    const students = await db.allAsync(`
      SELECT id
      FROM students
      WHERE course_id = ?
    `, [subject.course_id]);

    await db.runAsync('BEGIN TRANSACTION');

    for (const student of students) {

      const midVal =
        midterm && midterm[student.id] !== ''
          ? parseFloat(midterm[student.id])
          : null;

      const finVal =
        finals && finals[student.id] !== ''
          ? parseFloat(finals[student.id])
          : null;

      // MIDTERM

      if (midVal !== null && !isNaN(midVal)) {

        const existingMid = await db.getAsync(`
          SELECT id
          FROM marks
          WHERE student_id = ?
          AND subject_id = ?
          AND exam_type = 'Midterm'
        `, [student.id, subjectId]);

        if (existingMid) {

          await db.runAsync(`
            UPDATE marks
            SET marks = ?
            WHERE id = ?
          `, [midVal, existingMid.id]);

        } else {

          await db.runAsync(`
            INSERT INTO marks
            (student_id, subject_id, exam_type, marks)
            VALUES (?, ?, 'Midterm', ?)
          `, [student.id, subjectId, midVal]);

        }

      }

      // FINALS

      if (finVal !== null && !isNaN(finVal)) {

        const existingFin = await db.getAsync(`
          SELECT id
          FROM marks
          WHERE student_id = ?
          AND subject_id = ?
          AND exam_type = 'Finals'
        `, [student.id, subjectId]);

        if (existingFin) {

          await db.runAsync(`
            UPDATE marks
            SET marks = ?
            WHERE id = ?
          `, [finVal, existingFin.id]);

        } else {

          await db.runAsync(`
            INSERT INTO marks
            (student_id, subject_id, exam_type, marks)
            VALUES (?, ?, 'Finals', ?)
          `, [student.id, subjectId, finVal]);

        }

      }

    }

    await db.runAsync('COMMIT');

    const marksData = await db.allAsync(`
      SELECT *
      FROM marks
      WHERE subject_id = ?
    `, [subjectId]);

    const marksMap = {};

    marksData.forEach(record => {

      if (!marksMap[record.student_id]) {
        marksMap[record.student_id] = {};
      }

      marksMap[record.student_id][record.exam_type] = record.marks;

    });

    const studentsList = await db.allAsync(`
      SELECT *
      FROM students
      WHERE course_id = ?
      ORDER BY name
    `, [subject.course_id]);

    res.render('teacher/marks', {
      title: 'Gradebook',
      subject,
      students: studentsList,
      marksMap,
      success: 'Marks saved successfully!'
    });

  } catch (err) {

    console.error(err);

    await db.runAsync('ROLLBACK');

    res.status(500).send(err.stack);

  }

});


// ---------------------- STUDENT ROUTES ----------------------

// Student Dashboard
app.get('/student/dashboard', requireRole('student'), async (req, res) => {
  try {
    const studentId = req.session.profileId;
    const student = await db.getAsync(`
      SELECT s.*, c.course_name 
      FROM students s 
      LEFT JOIN courses c ON s.course_id = c.id 
      WHERE s.id = ?
    `, [studentId]);

    if (!student) return res.status(404).send('Student profile not found.');

    // 1. Calculate Attendance Percentage
    const attendanceStats = await db.allAsync('SELECT status FROM attendance WHERE student_id = ?', [studentId]);
    let attendancePercent = 100;
    if (attendanceStats.length > 0) {
      const presentCount = attendanceStats.filter(a => a.status === 'Present').length;
      const lateCount = attendanceStats.filter(a => a.status === 'Late').length;
      // Late counts as 0.75 attendance
      attendancePercent = Math.round(((presentCount + (lateCount * 0.75)) / attendanceStats.length) * 100);
    }

    // 2. Fetch Subjects and Marks
    const subjects = await db.allAsync('SELECT * FROM subjects WHERE course_id = ?', [student.course_id]);
    
    const academicRecords = [];
    for (const sub of subjects) {
      const midtermRecord = await db.getAsync('SELECT marks FROM marks WHERE student_id = ? AND subject_id = ? AND exam_type = "Midterm"', [studentId, sub.id]);
      const finalsRecord = await db.getAsync('SELECT marks FROM marks WHERE student_id = ? AND subject_id = ? AND exam_type = "Finals"', [studentId, sub.id]);

      const midMarks = midtermRecord ? midtermRecord.marks : null;
      const finMarks = finalsRecord ? finalsRecord.marks : null;

      // Calculate simple average
      let average = null;
      let grade = { letter: 'N/A', class: 'grade-na' };
      if (midMarks !== null || finMarks !== null) {
        const counts = [];
        if (midMarks !== null) counts.push(midMarks);
        if (finMarks !== null) counts.push(finMarks);
        average = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length);
        grade = calculateGrade(average);
      }

      // Fetch teacher info
      const teacher = sub.teacher_id ? await db.getAsync('SELECT name FROM teachers WHERE id = ?', [sub.teacher_id]) : { name: 'Staff' };

      academicRecords.push({
        subjectName: sub.subject_name,
        teacherName: teacher ? teacher.name : 'Unassigned',
        midterm: midMarks,
        finals: finMarks,
        average,
        grade
      });
    }

    res.render('student/dashboard', {
      title: 'Student Portal',
      student,
      attendancePercent,
      attendanceRecordsCount: attendanceStats.length,
      academicRecords
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});


// ---------------------- ERROR PAGES ----------------------

// Fallback Page Not Found
app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 - Not Found',
    error: 'The page you are looking for does not exist.',
    user: req.session.userId ? { role: req.session.role, name: req.session.name } : null
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`SRMS Server running on http://localhost:${PORT}`);
});
