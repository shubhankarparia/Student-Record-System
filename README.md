Premium Full-Stack Student Record Management System (SRMS)
Welcome to the ultra-modern, high-end Student Record Management System (SRMS) rebuilt from scratch using Node.js, Express, EJS, and SQLite.

This system features complete interactive dashboards for Admins, Teachers, and Students, fully implementing all components that were previously placeholders or skeletal structures.

Technical Features
Elegant Custom Theme: Built with absolute visual excellence in custom Vanilla CSS featuring frosted glass overlays (glassmorphism), responsive sidebars, grid cards, and modern animations.
Radial Progress Rings: Displays the student's overall attendance rate in a clean, visual ring using pure SVG metrics.
Interactive Charting: Features dynamic, real-time Chart.js integration on the Admin dashboard representing student enrolment counts per course.
Academic Performance Bars: Visual grade report progress bars indicating individual averages per subject.
Robust Security Routing: Complete custom middleware session controls enforcing role-based permissions (RBAC) across guest, student, teacher, and admin routers.
Zero-Configuration Database: Incorporates a self-migrating and auto-seeding SQLite file-based database. No complicated installation required!
Default Demo Access Accounts
For smooth immediate verification, the Sign-In page is equipped with automated auto-fill credential buttons! Or you may input them manually:

Administrator: admin / admin123
Faculty Member: teacher1 / teacher123
Student Enrollee: student1 / student123
Instructions to Run Locally
Since this machine does not have Node.js globally loaded in the environmental variables, you will need to perform a brief installation of Node.js first:

Step 1: Install Node.js
Download the recommended LTS installer from https://nodejs.org/.
Run the installer (it will automatically configure Node.js, npm, and register them to your terminal path).
Step 2: Open and Run the Project
Once Node.js is installed on your machine, open PowerShell or Command Prompt inside the FULL_STACK_PROJECT directory and execute the following commands:

# 1. Install all dependencies defined in package.json (including sqlite3 and bcryptjs)
npm install

# 2. Start the application server
npm start
Step 3: Access the Portal
Open your web browser and navigate to:

http://localhost:3000
The database will automatically initialize database.sqlite on the first run, perform all table creations, and populate all demo seed data!