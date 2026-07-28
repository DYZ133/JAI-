const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/lib', express.static(path.join(__dirname, 'node_modules')));

const DB_FILE = path.join(__dirname, 'data.json');

// ========== 数据存储 ==========
function load() {
  if (!fs.existsSync(DB_FILE)) {
    const init = {
      students: [],
      grades: [],
      dormitories: [],
      assignments: [],
      classes: [],
      courses: [],
      nextId: { student: 1, grade: 1, dormitory: 1, assignment: 1, class: 1, course: 1 }
    };
    seed(init);
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function save(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function nextId(db, key) {
  return db.nextId[key]++;
}

function now() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function seed(db) {
  const c1 = nextId(db, 'class');
  const c2 = nextId(db, 'class');
  const c3 = nextId(db, 'class');
  db.classes.push(
    { classId: c1, className: '软件工程2401班', grade: '2024级', major: '软件工程', department: '计算机学院', classTeacher: '张老师', studentCount: 0, status: '0', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' },
    { classId: c2, className: '软件工程2402班', grade: '2024级', major: '软件工程', department: '计算机学院', classTeacher: '李老师', studentCount: 0, status: '0', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' },
    { classId: c3, className: '计算机科学2401班', grade: '2024级', major: '计算机科学与技术', department: '计算机学院', classTeacher: '王老师', studentCount: 0, status: '0', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' }
  );

  for (let i = 1; i <= 6; i++) {
    const id = nextId(db, 'dormitory');
    const buildings = ['北苑1号楼', '北苑1号楼', '北苑1号楼', '北苑1号楼', '南苑1号楼', '南苑1号楼'];
    const floors = [1, 1, 1, 2, 1, 1];
    const rooms = ['101', '102', '103', '201', '101', '102'];
    const beds = [4, 4, 4, 4, 6, 6];
    const types = ['四人间', '四人间', '四人间', '四人间', '六人间', '六人间'];
    const fees = [800, 800, 800, 800, 600, 600];
    const balconies = ['1', '1', '1', '1', '0', '0'];
    const washrooms = ['1', '1', '1', '1', '0', '0'];
    db.dormitories.push({
      dormitoryId: id, buildingName: buildings[i-1], floor: floors[i-1], roomNo: rooms[i-1],
      bedCount: beds[i-1], occupiedCount: 0, roomType: types[i-1], hasBalcony: balconies[i-1],
      hasAircon: '1', hasWashroom: washrooms[i-1], monthlyFee: fees[i-1], status: '0',
      createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: ''
    });
  }

  const courseData = [
    ['MATH101', '高等数学（上）', 5.0, '必修', '张教授', '2024-2025-1', 80, '考试'],
    ['ENG101', '大学英语（一）', 4.0, '必修', '李教授', '2024-2025-1', 64, '考试'],
    ['CS101', '程序设计基础', 4.0, '必修', '王教授', '2024-2025-1', 64, '考试'],
    ['CS201', '数据结构', 4.0, '必修', '赵教授', '2024-2025-2', 64, '考试'],
    ['CS202', '数据库原理', 3.0, '必修', '孙教授', '2024-2025-2', 48, '考试'],
    ['GEN101', '大学生心理健康', 2.0, '公选', '陈老师', '2024-2025-1', 32, '考查'],
  ];
  courseData.forEach(c => {
    const id = nextId(db, 'course');
    db.courses.push({ courseId: id, courseCode: c[0], courseName: c[1], credit: c[2], courseType: c[3], teacher: c[4], semester: c[5], classHour: c[6], examType: c[7], status: '0', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' });
  });

  // 示例学生
  const s1 = nextId(db, 'student');
  const s2 = nextId(db, 'student');
  const s3 = nextId(db, 'student');
  db.students.push(
    { studentId: s1, studentNo: '2024001', studentName: '张三', gender: '0', birthDate: '2006-03-15', idCard: '', phone: '13800138001', email: 'zhangsan@example.com', nativePlace: '江苏省南京市', nation: '汉族', politicalStatus: '共青团员', classId: c1, className: '软件工程2401班', enrollmentDate: '2024-09-01', graduationDate: '2028-07-01', status: '0', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' },
    { studentId: s2, studentNo: '2024002', studentName: '李四', gender: '1', birthDate: '2005-08-22', idCard: '', phone: '13800138002', email: 'lisi@example.com', nativePlace: '浙江省杭州市', nation: '汉族', politicalStatus: '共青团员', classId: c1, className: '软件工程2401班', enrollmentDate: '2024-09-01', graduationDate: '2028-07-01', status: '0', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' },
    { studentId: s3, studentNo: '2024003', studentName: '王五', gender: '0', birthDate: '2006-01-10', idCard: '', phone: '13800138003', email: 'wangwu@example.com', nativePlace: '上海市', nation: '汉族', politicalStatus: '群众', classId: c2, className: '软件工程2402班', enrollmentDate: '2024-09-01', graduationDate: '2028-07-01', status: '0', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' }
  );

  // 示例住宿
  db.assignments.push(
    { assignmentId: nextId(db, 'assignment'), studentId: s1, studentName: '张三', studentNo: '2024001', dormitoryId: 1, buildingName: '北苑1号楼', roomNo: '101', bedNo: 'A床', checkInDate: '2024-09-01', checkOutDate: '', isCurrent: '1', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' },
    { assignmentId: nextId(db, 'assignment'), studentId: s2, studentName: '李四', studentNo: '2024002', dormitoryId: 1, buildingName: '北苑1号楼', roomNo: '101', bedNo: 'B床', checkInDate: '2024-09-01', checkOutDate: '', isCurrent: '1', createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: '' }
  );
  db.dormitories[0].occupiedCount = 2;

  // 示例成绩
  const grades = [
    [s1, 1, 92.5], [s1, 2, 85], [s1, 3, 78],
    [s2, 1, 88], [s2, 3, 95], [s3, 1, 60]
  ];
  grades.forEach(g => {
    const score = g[2];
    let level, point;
    if (score >= 90) { level = '优秀'; point = 4.0; }
    else if (score >= 80) { level = '良好'; point = 3.0; }
    else if (score >= 70) { level = '中等'; point = 2.0; }
    else if (score >= 60) { level = '及格'; point = 1.0; }
    else { level = '不及格'; point = 0.0; }
    db.grades.push({
      gradeId: nextId(db, 'grade'), studentId: g[0], studentName: db.students.find(s => s.studentId === g[0]).studentName,
      studentNo: db.students.find(s => s.studentId === g[0]).studentNo,
      courseId: g[1], courseName: db.courses.find(c => c.courseId === g[1]).courseName,
      score, gradePoint: point, gradeLevel: level, semester: '2024-2025-1', examType: '期末',
      makeupScore: null, isPassed: score >= 60 ? '1' : '0',
      createBy: 'admin', createTime: now(), updateBy: '', updateTime: '', remark: ''
    });
  });
}

// ========== 分页辅助 ==========
function paginate(list, pageNum = 1, pageSize = 10) {
  const total = list.length;
  const start = (pageNum - 1) * pageSize;
  return { rows: list.slice(start, start + pageSize), total };
}

// ============ 学生 API ============
app.get('/api/student/info/list', (req, res) => {
  const db = load();
  let list = [...db.students];
  const { studentNo, studentName, gender, classId, status } = req.query;
  if (studentNo) list = list.filter(s => s.studentNo.includes(studentNo));
  if (studentName) list = list.filter(s => s.studentName.includes(studentName));
  if (gender) list = list.filter(s => s.gender === gender);
  if (classId) list = list.filter(s => s.classId == classId);
  if (status) list = list.filter(s => s.status === status);
  list.sort((a, b) => b.studentId - a.studentId);
  // 关联班级名
  list.forEach(s => { if (!s.className && s.classId) { const c = db.classes.find(x => x.classId == s.classId); s.className = c ? c.className : ''; } });
  res.json(paginate(list, parseInt(req.query.pageNum) || 1, parseInt(req.query.pageSize) || 10));
});

app.get('/api/student/info/all', (req, res) => {
  const db = load();
  res.json({ data: db.students.filter(s => s.status === '0') });
});

app.get('/api/student/info/:id', (req, res) => {
  const db = load();
  const s = db.students.find(x => x.studentId == req.params.id);
  if (s && s.classId) { const c = db.classes.find(x => x.classId == s.classId); s.className = c ? c.className : ''; }
  res.json({ data: s || null });
});

app.post('/api/student/info', (req, res) => {
  const db = load();
  const exist = db.students.find(s => s.studentNo === req.body.studentNo);
  if (exist) return res.json({ code: 500, msg: '学号已存在' });
  const id = nextId(db, 'student');
  const c = db.classes.find(x => x.classId == req.body.classId);
  const s = { ...req.body, studentId: id, className: c ? c.className : '', createTime: now(), updateTime: '' };
  db.students.push(s);
  if (c) { c.studentCount = (c.studentCount || 0) + 1; }
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.put('/api/student/info', (req, res) => {
  const db = load();
  const idx = db.students.findIndex(x => x.studentId == req.body.studentId);
  if (idx === -1) return res.json({ code: 500, msg: '学生不存在' });
  const exist = db.students.find(s => s.studentNo === req.body.studentNo && s.studentId != req.body.studentId);
  if (exist) return res.json({ code: 500, msg: '学号已存在' });
  const c = db.classes.find(x => x.classId == req.body.classId);
  db.students[idx] = { ...db.students[idx], ...req.body, className: c ? c.className : '', updateTime: now() };
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.delete('/api/student/info/:ids', (req, res) => {
  const db = load();
  const ids = req.params.ids.split(',').map(Number);
  db.students = db.students.filter(s => !ids.includes(s.studentId));
  db.grades = db.grades.filter(g => !ids.includes(g.studentId));
  db.assignments = db.assignments.filter(a => !ids.includes(a.studentId));
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

// ============ 成绩 API ============
app.get('/api/student/grade/list', (req, res) => {
  const db = load();
  let list = [...db.grades];
  const { studentId, courseId, semester, examType, isPassed } = req.query;
  if (studentId) list = list.filter(g => g.studentId == studentId);
  if (courseId) list = list.filter(g => g.courseId == courseId);
  if (semester) list = list.filter(g => g.semester === semester);
  if (examType) list = list.filter(g => g.examType === examType);
  if (isPassed) list = list.filter(g => g.isPassed === isPassed);
  list.sort((a, b) => b.gradeId - a.gradeId);
  res.json(paginate(list, parseInt(req.query.pageNum) || 1, parseInt(req.query.pageSize) || 10));
});

app.get('/api/student/grade/student/:studentId', (req, res) => {
  const db = load();
  res.json({ data: db.grades.filter(g => g.studentId == req.params.studentId) });
});

app.get('/api/student/grade/:id', (req, res) => {
  const db = load();
  res.json({ data: db.grades.find(x => x.gradeId == req.params.id) || null });
});

function calcGrade(score) {
  if (score >= 90) return { gradeLevel: '优秀', gradePoint: 4.0 };
  if (score >= 80) return { gradeLevel: '良好', gradePoint: 3.0 };
  if (score >= 70) return { gradeLevel: '中等', gradePoint: 2.0 };
  if (score >= 60) return { gradeLevel: '及格', gradePoint: 1.0 };
  return { gradeLevel: '不及格', gradePoint: 0.0 };
}

app.post('/api/student/grade', (req, res) => {
  const db = load();
  const id = nextId(db, 'grade');
  const student = db.students.find(s => s.studentId == req.body.studentId);
  const course = db.courses.find(c => c.courseId == req.body.courseId);
  const { gradeLevel, gradePoint } = calcGrade(req.body.score || 0);
  const g = {
    ...req.body, gradeId: id,
    studentName: student ? student.studentName : '',
    studentNo: student ? student.studentNo : '',
    courseName: course ? course.courseName : '',
    gradeLevel, gradePoint,
    isPassed: (req.body.score || 0) >= 60 ? '1' : '0',
    createTime: now(), updateTime: ''
  };
  db.grades.push(g);
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.put('/api/student/grade', (req, res) => {
  const db = load();
  const idx = db.grades.findIndex(x => x.gradeId == req.body.gradeId);
  if (idx === -1) return res.json({ code: 500, msg: '成绩不存在' });
  const { gradeLevel, gradePoint } = calcGrade(req.body.score || 0);
  db.grades[idx] = { ...db.grades[idx], ...req.body, gradeLevel, gradePoint, isPassed: (req.body.score || 0) >= 60 ? '1' : '0', updateTime: now() };
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.delete('/api/student/grade/:ids', (req, res) => {
  const db = load();
  const ids = req.params.ids.split(',').map(Number);
  db.grades = db.grades.filter(g => !ids.includes(g.gradeId));
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

// ============ 宿舍 API ============
app.get('/api/student/dormitory/list', (req, res) => {
  const db = load();
  let list = [...db.dormitories];
  const { buildingName, roomType, status } = req.query;
  if (buildingName) list = list.filter(d => d.buildingName.includes(buildingName));
  if (roomType) list = list.filter(d => d.roomType === roomType);
  if (status) list = list.filter(d => d.status === status);
  list.sort((a, b) => a.buildingName.localeCompare(b.buildingName) || a.floor - b.floor || a.roomNo.localeCompare(b.roomNo));
  res.json(paginate(list, parseInt(req.query.pageNum) || 1, parseInt(req.query.pageSize) || 10));
});

app.get('/api/student/dormitory/available', (req, res) => {
  const db = load();
  res.json({ data: db.dormitories.filter(d => d.status === '0' && d.occupiedCount < d.bedCount) });
});

app.get('/api/student/dormitory/:id', (req, res) => {
  const db = load();
  res.json({ data: db.dormitories.find(x => x.dormitoryId == req.params.id) || null });
});

app.post('/api/student/dormitory', (req, res) => {
  const db = load();
  const id = nextId(db, 'dormitory');
  db.dormitories.push({ ...req.body, dormitoryId: id, occupiedCount: 0, createTime: now(), updateTime: '' });
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.put('/api/student/dormitory', (req, res) => {
  const db = load();
  const idx = db.dormitories.findIndex(x => x.dormitoryId == req.body.dormitoryId);
  if (idx === -1) return res.json({ code: 500, msg: '宿舍不存在' });
  db.dormitories[idx] = { ...db.dormitories[idx], ...req.body, updateTime: now() };
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.delete('/api/student/dormitory/:ids', (req, res) => {
  const db = load();
  const ids = req.params.ids.split(',').map(Number);
  db.dormitories = db.dormitories.filter(d => !ids.includes(d.dormitoryId));
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

// ============ 住宿分配 API ============
app.get('/api/student/dormitory/assignment/list', (req, res) => {
  const db = load();
  let list = [...db.assignments];
  list.sort((a, b) => b.assignmentId - a.assignmentId);
  res.json(paginate(list, parseInt(req.query.pageNum) || 1, parseInt(req.query.pageSize) || 10));
});

app.get('/api/student/dormitory/assignment/student/:studentId', (req, res) => {
  const db = load();
  res.json({ data: db.assignments.find(a => a.studentId == req.params.studentId && a.isCurrent === '1') || null });
});

app.get('/api/student/dormitory/assignment/:id', (req, res) => {
  const db = load();
  res.json({ data: db.assignments.find(x => x.assignmentId == req.params.id) || null });
});

app.post('/api/student/dormitory/assignment', (req, res) => {
  const db = load();
  const dorm = db.dormitories.find(d => d.dormitoryId == req.body.dormitoryId);
  if (!dorm) return res.json({ code: 500, msg: '宿舍不存在' });
  if (dorm.occupiedCount >= dorm.bedCount) return res.json({ code: 500, msg: '该宿舍已满，无法分配' });
  const current = db.assignments.find(a => a.studentId == req.body.studentId && a.isCurrent === '1');
  if (current) return res.json({ code: 500, msg: '该学生已分配宿舍，请先退宿' });
  const id = nextId(db, 'assignment');
  const student = db.students.find(s => s.studentId == req.body.studentId);
  db.assignments.push({
    ...req.body, assignmentId: id, isCurrent: '1',
    studentName: student ? student.studentName : '',
    studentNo: student ? student.studentNo : '',
    buildingName: dorm.buildingName, roomNo: dorm.roomNo,
    checkInDate: req.body.checkInDate || new Date().toISOString().substring(0, 10),
    createTime: now(), updateTime: ''
  });
  dorm.occupiedCount++;
  if (dorm.occupiedCount >= dorm.bedCount) dorm.status = '2';
  save(db);
  res.json({ code: 200, msg: '分配成功' });
});

app.put('/api/student/dormitory/assignment', (req, res) => {
  const db = load();
  const idx = db.assignments.findIndex(x => x.assignmentId == req.body.assignmentId);
  if (idx === -1) return res.json({ code: 500, msg: '记录不存在' });
  db.assignments[idx] = { ...db.assignments[idx], ...req.body, updateTime: now() };
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.put('/api/student/dormitory/assignment/checkout/:id', (req, res) => {
  const db = load();
  const a = db.assignments.find(x => x.assignmentId == req.params.id);
  if (!a || a.isCurrent !== '1') return res.json({ code: 500, msg: '该记录不存在或已退宿' });
  a.isCurrent = '0';
  a.checkOutDate = new Date().toISOString().substring(0, 10);
  a.updateTime = now();
  const dorm = db.dormitories.find(d => d.dormitoryId == a.dormitoryId);
  if (dorm) {
    dorm.occupiedCount = Math.max(0, dorm.occupiedCount - 1);
    if (dorm.status === '2') dorm.status = '0';
  }
  save(db);
  res.json({ code: 200, msg: '退宿成功' });
});

app.delete('/api/student/dormitory/assignment/:ids', (req, res) => {
  const db = load();
  const ids = req.params.ids.split(',').map(Number);
  db.assignments = db.assignments.filter(a => !ids.includes(a.assignmentId));
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

// ============ 班级 API ============
app.get('/api/student/class/list', (req, res) => {
  const db = load();
  let list = [...db.classes];
  const { className, major, department } = req.query;
  if (className) list = list.filter(c => c.className.includes(className));
  if (major) list = list.filter(c => c.major.includes(major));
  if (department) list = list.filter(c => c.department.includes(department));
  res.json(paginate(list, parseInt(req.query.pageNum) || 1, parseInt(req.query.pageSize) || 10));
});

app.get('/api/student/class/all', (req, res) => {
  const db = load();
  res.json({ data: db.classes.filter(c => c.status === '0') });
});

app.get('/api/student/class/:id', (req, res) => {
  const db = load();
  res.json({ data: db.classes.find(x => x.classId == req.params.id) || null });
});

app.post('/api/student/class', (req, res) => {
  const db = load();
  if (db.classes.find(c => c.className === req.body.className)) return res.json({ code: 500, msg: '班级名称已存在' });
  const id = nextId(db, 'class');
  db.classes.push({ ...req.body, classId: id, createTime: now(), updateTime: '' });
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.put('/api/student/class', (req, res) => {
  const db = load();
  const idx = db.classes.findIndex(x => x.classId == req.body.classId);
  if (idx === -1) return res.json({ code: 500, msg: '班级不存在' });
  const dup = db.classes.find(c => c.className === req.body.className && c.classId != req.body.classId);
  if (dup) return res.json({ code: 500, msg: '班级名称已存在' });
  db.classes[idx] = { ...db.classes[idx], ...req.body, updateTime: now() };
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.delete('/api/student/class/:ids', (req, res) => {
  const db = load();
  const ids = req.params.ids.split(',').map(Number);
  db.classes = db.classes.filter(c => !ids.includes(c.classId));
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

// ============ 课程 API ============
app.get('/api/student/course/list', (req, res) => {
  const db = load();
  let list = [...db.courses];
  const { courseName, courseType, teacher } = req.query;
  if (courseName) list = list.filter(c => c.courseName.includes(courseName));
  if (courseType) list = list.filter(c => c.courseType === courseType);
  if (teacher) list = list.filter(c => c.teacher.includes(teacher));
  res.json(paginate(list, parseInt(req.query.pageNum) || 1, parseInt(req.query.pageSize) || 10));
});

app.get('/api/student/course/all', (req, res) => {
  const db = load();
  res.json({ data: db.courses.filter(c => c.status === '0') });
});

app.get('/api/student/course/:id', (req, res) => {
  const db = load();
  res.json({ data: db.courses.find(x => x.courseId == req.params.id) || null });
});

app.post('/api/student/course', (req, res) => {
  const db = load();
  if (db.courses.find(c => c.courseCode === req.body.courseCode)) return res.json({ code: 500, msg: '课程编码已存在' });
  const id = nextId(db, 'course');
  db.courses.push({ ...req.body, courseId: id, createTime: now(), updateTime: '' });
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.put('/api/student/course', (req, res) => {
  const db = load();
  const idx = db.courses.findIndex(x => x.courseId == req.body.courseId);
  if (idx === -1) return res.json({ code: 500, msg: '课程不存在' });
  const dup = db.courses.find(c => c.courseCode === req.body.courseCode && c.courseId != req.body.courseId);
  if (dup) return res.json({ code: 500, msg: '课程编码已存在' });
  db.courses[idx] = { ...db.courses[idx], ...req.body, updateTime: now() };
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

app.delete('/api/student/course/:ids', (req, res) => {
  const db = load();
  const ids = req.params.ids.split(',').map(Number);
  db.courses = db.courses.filter(c => !ids.includes(c.courseId));
  save(db);
  res.json({ code: 200, msg: '操作成功' });
});

// ============ 仪表盘统计 ============
app.get('/api/dashboard/stats', (req, res) => {
  const db = load();
  res.json({
    studentCount: db.students.filter(s => s.status === '0').length,
    classCount: db.classes.filter(c => c.status === '0').length,
    dormitoryCount: db.dormitories.length,
    courseCount: db.courses.filter(c => c.status === '0').length,
    availableBeds: db.dormitories.reduce((sum, d) => sum + Math.max(0, d.bedCount - d.occupiedCount), 0),
    passRate: db.grades.length > 0 ? (db.grades.filter(g => g.isPassed === '1').length / db.grades.length * 100).toFixed(1) : 0
  });
});

// ============ 数据导出/导入 API ============
app.get('/api/data/export', (req, res) => {
  const db = load();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=data-backup.json');
  res.json(db);
});

app.post('/api/data/import', (req, res) => {
  try {
    const newData = req.body;
    // 基本校验
    if (!newData.students || !newData.grades || !newData.dormitories || !newData.assignments || !newData.classes || !newData.courses) {
      return res.json({ code: 500, msg: '数据格式不正确，缺少必要的字段' });
    }
    save(newData);
    res.json({ code: 200, msg: '数据导入成功' });
  } catch (e) {
    res.json({ code: 500, msg: '导入失败：' + e.message });
  }
});

const PORT = process.env.PORT || 3456;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================`);
  console.log(`  学生信息管理系统已启动！`);
  console.log(`  请在浏览器中打开:`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`========================================`);
});
