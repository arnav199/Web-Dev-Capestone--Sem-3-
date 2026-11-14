const mongoose = require('mongoose');
const Section = require('../models/Section');
const Enrollment = require('../models/Enrollment');
const Attendance = require('../models/Attendance');
const Announcement = require('../models/Announcement');
const User = require('../models/User');
const Course = require('../models/Course');
const events = require('../utils/appEvents');
const asyncHandler = require('../utils/asyncHandler');

exports.enroll = asyncHandler(async (req, res) => {
  const { student, section } = req.body;
  const targetStudent = req.user.role === 'student' ? req.user.id : student;
  if (!targetStudent) return res.status(400).json({ success: false, error: { message: 'student is required' } });
  const [studentRecord, sectionRecord] = await Promise.all([User.findById(targetStudent), Section.findById(section)]);
  if (!studentRecord || studentRecord.role !== 'student' || !sectionRecord || !sectionRecord.active) {
    return res.status(400).json({ success: false, error: { message: 'Valid student and active section are required' } });
  }
  const count = await Enrollment.countDocuments({ section, status: 'enrolled' });
  if (count >= sectionRecord.capacity) return res.status(409).json({ success: false, error: { message: 'Section is full' } });
  const enrollment = await Enrollment.create({ student: targetStudent, section });
  res.status(201).json({ success: true, data: enrollment });
});

exports.createSection = asyncHandler(async (req, res) => {
  const [course, faculty] = await Promise.all([Course.findById(req.body.course), User.findById(req.body.faculty)]);
  if (!course || !faculty || faculty.role !== 'faculty') return res.status(400).json({ success: false, error: { message: 'A valid course and faculty account are required' } });
  const section = await Section.create(req.body);
  res.status(201).json({ success: true, data: section });
});

exports.updateSection = asyncHandler(async (req, res) => {
  if (req.body.course) {
    const course = await Course.findById(req.body.course);
    if (!course) return res.status(400).json({ success: false, error: { message: 'Course not found' } });
  }
  if (req.body.faculty) {
    const faculty = await User.findById(req.body.faculty);
    if (!faculty || faculty.role !== 'faculty') return res.status(400).json({ success: false, error: { message: 'A valid faculty account is required' } });
  }
  const updates = {};
  for (const key of ['course', 'name', 'faculty', 'term', 'capacity', 'active']) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const item = await Section.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ success: false, error: { message: 'Resource not found' } });
  res.json({ success: true, data: item });
});

exports.markAttendance = asyncHandler(async (req, res) => {
  const { section, sessionDate, records } = req.body;
  const sectionRecord = await Section.findById(section);
  if (!sectionRecord) return res.status(404).json({ success: false, error: { message: 'Section not found' } });
  if (req.user.role === 'faculty' && String(sectionRecord.faculty) !== req.user.id) return res.status(403).json({ success: false, error: { message: 'Section is not assigned to you' } });
  const enrolled = await Enrollment.find({ section, status: 'enrolled', student: { $in: records.map((r) => r.student) } }).select('student');
  const enrolledIds = new Set(enrolled.map((e) => String(e.student)));
  if (records.some((r) => !enrolledIds.has(String(r.student)))) return res.status(400).json({ success: false, error: { message: 'Every student must be enrolled in this section' } });
  const date = new Date(sessionDate);
  date.setUTCHours(0, 0, 0, 0);
  const ops = records.map(({ student, status }) => ({ updateOne: {
    filter: { student, section, sessionDate: date },
    update: { $setOnInsert: { student, section, sessionDate: date, markedBy: req.user.id }, $set: { status } },
    upsert: true
  } }));
  try { await Attendance.bulkWrite(ops, { ordered: true }); }
  catch (e) { if (e.code === 11000) return res.status(409).json({ success: false, error: { message: 'Attendance already exists for this class session' } }); throw e; }
  events.emit('attendance:marked', { section: String(section), sessionDate: date.toISOString(), count: records.length });
  res.status(201).json({ success: true, data: { saved: records.length } });
});

exports.correctAttendance = asyncHandler(async (req, res) => {
  const item = await Attendance.findById(req.params.id).populate('section');
  if (!item) return res.status(404).json({ success: false, error: { message: 'Attendance record not found' } });
  if (req.user.role === 'faculty' && String(item.section.faculty) !== req.user.id) return res.status(403).json({ success: false, error: { message: 'Section is not assigned to you' } });
  item.status = req.body.status;
  item.markedBy = req.user.id;
  item.correctionNote = req.body.correctionNote;
  await item.save();
  events.emit('attendance:corrected', { recordId: item.id, section: String(item.section.id) });
  res.json({ success: true, data: item });
});

exports.attendanceSummary = asyncHandler(async (req, res) => {
  const studentId = req.user.role === 'student' ? req.user.id : (req.query.studentId || req.user.id);
  if (req.user.role === 'faculty' && req.query.studentId) {
    const sectionIds = await Section.find({ faculty: req.user.id }).distinct('_id');
    const enrollment = await Enrollment.findOne({ student: studentId, section: { $in: sectionIds }, status: 'enrolled' });
    if (!enrollment) return res.status(403).json({ success: false, error: { message: 'Student is not enrolled in your section' } });
  }
  const summary = await Attendance.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(studentId) } },
    { $group: { _id: '$section', totalClasses: { $sum: 1 }, attended: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } } } },
    { $addFields: { percentage: { $multiply: [{ $divide: ['$attended', '$totalClasses'] }, 100] } } },
    { $lookup: { from: 'sections', localField: '_id', foreignField: '_id', as: 'section' } }, { $unwind: '$section' },
    { $lookup: { from: 'courses', localField: 'section.course', foreignField: '_id', as: 'course' } }, { $unwind: '$course' },
    { $project: { _id: 0, sectionId: '$section._id', section: '$section.name', courseCode: '$course.code', courseTitle: '$course.title', totalClasses: 1, attended: 1, percentage: { $round: ['$percentage', 2] } } }
  ]);
  res.json({ success: true, data: summary, meta: { threshold: Number(process.env.ATTENDANCE_THRESHOLD || 75) } });
});

exports.lowAttendance = asyncHandler(async (req, res) => {
  const threshold = Math.max(0, Math.min(100, Number(req.query.threshold) || Number(process.env.ATTENDANCE_THRESHOLD) || 75));
  const facultySections = req.user.role === 'faculty' ? await Section.find({ faculty: req.user.id }).distinct('_id') : null;
  const report = await Attendance.aggregate([
    ...(facultySections ? [{ $match: { section: { $in: facultySections } } }] : []),
    { $group: { _id: { student: '$student', section: '$section' }, totalClasses: { $sum: 1 }, attended: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } } } },
    { $addFields: { percentage: { $multiply: [{ $divide: ['$attended', '$totalClasses'] }, 100] } } },
    { $match: { percentage: { $lt: threshold } } },
    { $lookup: { from: 'users', localField: '_id.student', foreignField: '_id', as: 'student' } }, { $unwind: '$student' },
    { $lookup: { from: 'sections', localField: '_id.section', foreignField: '_id', as: 'section' } }, { $unwind: '$section' },
    { $lookup: { from: 'courses', localField: 'section.course', foreignField: '_id', as: 'course' } }, { $unwind: '$course' },
    { $project: { studentId: '$student._id', name: '$student.name', email: '$student.email', section: '$section.name', course: '$course.code', totalClasses: 1, attended: 1, percentage: { $round: ['$percentage', 2] } } },
    { $sort: { percentage: 1 } }
  ]);
  res.json({ success: true, data: report, meta: { threshold } });
});

exports.courseEnrollmentReport = asyncHandler(async (req, res) => {
  const facultySections = req.user.role === 'faculty' ? await Section.find({ faculty: req.user.id }).distinct('_id') : null;
  const report = await Enrollment.aggregate([
    { $match: { status: 'enrolled' } },
    { $lookup: { from: 'sections', localField: 'section', foreignField: '_id', as: 'section' } }, { $unwind: '$section' },
    ...(facultySections ? [{ $match: { 'section._id': { $in: facultySections } } }] : []),
    { $lookup: { from: 'courses', localField: 'section.course', foreignField: '_id', as: 'course' } }, { $unwind: '$course' },
    { $group: { _id: { course: '$course._id', section: '$section._id' }, courseCode: { $first: '$course.code' }, courseTitle: { $first: '$course.title' }, section: { $first: '$section.name' }, term: { $first: '$section.term' }, enrollmentCount: { $sum: 1 }, capacity: { $first: '$section.capacity' } } },
    { $sort: { courseCode: 1, section: 1 } }
  ]);
  res.json({ success: true, data: report });
});

exports.createAnnouncement = asyncHandler(async (req, res) => {
  const payload = { ...req.body, createdBy: req.user.id };
  if (payload.audience === 'section' && !payload.section) return res.status(400).json({ success: false, error: { message: 'section is required for section announcements' } });
  if (payload.audience === 'course' && !payload.course && !payload.section) return res.status(400).json({ success: false, error: { message: 'course or section is required for course announcements' } });
  if (req.user.role === 'faculty') {
    if (payload.audience === 'university') return res.status(403).json({ success: false, error: { message: 'Faculty cannot publish university-wide announcements' } });
    if (payload.section) {
      const section = await Section.findById(payload.section);
      if (!section || String(section.faculty) !== req.user.id) return res.status(403).json({ success: false, error: { message: 'Section is not assigned to you' } });
      if (payload.course && String(section.course) !== String(payload.course)) return res.status(400).json({ success: false, error: { message: 'Course does not match section' } });
      if (payload.audience === 'course') payload.course = section.course;
    } else if (payload.course) {
      const assigned = await Section.exists({ course: payload.course, faculty: req.user.id });
      if (!assigned) return res.status(403).json({ success: false, error: { message: 'Course is not assigned to you' } });
    }
  }
  if (payload.section && !(await Section.exists({ _id: payload.section }))) return res.status(400).json({ success: false, error: { message: 'Section not found' } });
  if (payload.course && !(await Course.exists({ _id: payload.course }))) return res.status(400).json({ success: false, error: { message: 'Course not found' } });
  const announcement = await Announcement.create(payload);
  events.emit('announcement:created', announcement.toObject());
  res.status(201).json({ success: true, data: announcement });
});

exports.listAnnouncements = asyncHandler(async (req, res) => {
  let sectionIds = [];
  if (req.user.role === 'student') sectionIds = await Enrollment.find({ student: req.user.id, status: 'enrolled' }).distinct('section');
  const courseIds = req.user.role === 'student' ? await Section.find({ _id: { $in: sectionIds } }).distinct('course') : [];
  const filter = req.user.role === 'student'
    ? { $or: [{ audience: 'university' }, { audience: 'section', section: { $in: sectionIds } }, { audience: 'course', course: { $in: courseIds } }] }
    : {};
  const items = await Announcement.find(filter).populate('createdBy', 'name role').sort({ publishedAt: -1 }).limit(100);
  res.json({ success: true, data: items });
});

exports.facultySectionGuard = asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'faculty') return next();
  const sectionId = req.params.sectionId || req.query.section || req.body.section;
  if (!sectionId) return res.status(400).json({ success: false, error: { message: 'Section is required' } });
  const section = await Section.findOne({ _id: sectionId, faculty: req.user.id });
  if (!section) return res.status(403).json({ success: false, error: { message: 'Section is not assigned to you' } });
  next();
});

exports.listEnrollments = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === 'faculty') filter.section = { $in: await Section.find({ faculty: req.user.id }).distinct('_id') };
  if (req.query.section) {
    if (req.user.role === 'faculty' && !filter.section.$in.some((id) => String(id) === req.query.section)) return res.status(403).json({ success: false, error: { message: 'Section is not assigned to you' } });
    filter.section = req.query.section;
  }
  if (req.query.student) filter.student = req.query.student;
  const items = await Enrollment.find(filter).populate('student', 'name studentId email').populate('section', 'name term course').sort({ enrolledAt: -1 }).limit(Math.min(100, Number(req.query.limit) || 50));
  res.json({ success: true, data: items });
});
