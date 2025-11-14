import React, { useEffect, useMemo, useState } from 'react'
import {
    Calendar, Clock, Book, Settings, ChevronRight, BarChart3, Users, FileText,
    Home, Menu, Lock, Mail, Eye, EyeOff, GraduationCap, LogOut, UserCircle, Shield
} from 'lucide-react'
import { auth, db, storage } from './firebase'
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from 'firebase/auth'
import {
    doc, getDoc, setDoc, getDocs, collection, query, where, addDoc, updateDoc, deleteDoc,
    serverTimestamp, orderBy
} from 'firebase/firestore'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'

const buildDefaultProfile = (user, signupData = null) => {
    const email = user.email ?? ''
    let role = 'student'
    let name = 'Wesley Matthews'
    let program = 'Applied Computer Technology'
    let studentId = '651395'
    let year = '3rd Year'
    let gpa = 3.85

    // Use signup data if provided
    if (signupData) {
        name = signupData.fullName || name
        role = signupData.role || role
        program = signupData.program || program
        studentId = signupData.studentId || studentId
    } else {
        // Fallback to email-based detection
        if (email.includes('admin')) {
            role = 'admin'
            name = 'Campus Administrator'
            program = null
            studentId = null
            year = null
            gpa = null
        } else if (email.includes('lecturer')) {
            role = 'lecturer'
            name = 'Dr. Sarah Johnson'
            program = 'Department of Mathematics'
            studentId = null
            year = null
            gpa = null
        }
    }

    return {
        uid: user.uid,
        email,
        name,
        role,
        program: role === 'student' ? program : null,
        studentId: role === 'student' ? studentId : null,
        year: role === 'student' ? year : null,
        gpa: role === 'student' ? gpa : null,
        createdAt: serverTimestamp(),
    }
}

const SCMS = () => {
    const [sidebarOpen, setSidebarOpen] = useState(true)
    const [showPassword, setShowPassword] = useState(false)
    const [authView, setAuthView] = useState('login')
    const [loginForm, setLoginForm] = useState({ email: '', password: '' })
    const [signupForm, setSignupForm] = useState({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'student',
        studentId: '',
        program: ''
    })
    const [loginError, setLoginError] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [loadingSession, setLoadingSession] = useState(true)
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [userProfile, setUserProfile] = useState(null)
    const [currentView, setCurrentView] = useState('dashboard')
    const [coursesData, setCoursesData] = useState([])
    const [students, setStudents] = useState([])
    const [lecturers, setLecturers] = useState([])
    const [loading, setLoading] = useState(false)
    const [showCourseModal, setShowCourseModal] = useState(false)
    const [showStudentModal, setShowStudentModal] = useState(false)
    const [selectedCourse, setSelectedCourse] = useState(null)
    const [selectedStudent, setSelectedStudent] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterProgram, setFilterProgram] = useState('')
    const [newCourse, setNewCourse] = useState({
        name: '',
        code: '',
        instructor: '',
        credits: 3,
        schedule: '',
        capacity: 30
    })
    const [enrollments, setEnrollments] = useState([])
    const [courseMaterials, setCourseMaterials] = useState([])
    const [grades, setGrades] = useState([])
    const [showMaterialModal, setShowMaterialModal] = useState(false)
    const [showGradeModal, setShowGradeModal] = useState(false)
    const [showEnrollmentModal, setShowEnrollmentModal] = useState(false)
    const [newMaterial, setNewMaterial] = useState({ title: '', type: 'document', url: '', courseId: '' })
    const [materialFile, setMaterialFile] = useState(null)
    const [uploadingMaterial, setUploadingMaterial] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [newGrade, setNewGrade] = useState({ studentId: '', courseId: '', grade: '', assignment: '' })
    const [selectedCourseForAction, setSelectedCourseForAction] = useState(null)
    const [enrolledStudentsForGrade, setEnrolledStudentsForGrade] = useState([])

    // Calculate real stats from Firebase data
    const statsByRole = useMemo(() => {
        if (!userProfile) return { student: [], lecturer: [], admin: [] }

        const role = userProfile.role

        if (role === 'student') {
            const enrolledCount = enrollments.length
            const totalCredits = coursesData
                .filter(c => enrollments.some(e => e.courseId === c.id && e.studentId === userProfile.uid))
                .reduce((sum, c) => sum + (c.credits || 0), 0)
            const avgGrade = grades.length > 0
                ? (grades.reduce((sum, g) => sum + parseFloat(g.grade || 0), 0) / grades.length).toFixed(1)
                : 'N/A'

            return [
                { label: 'Enrolled Courses', value: enrolledCount.toString(), icon: Book, color: 'from-blue-500 to-blue-700' },
                { label: 'Total Credits', value: totalCredits.toString(), icon: Clock, color: 'from-orange-500 to-orange-700' },
                { label: 'Total Grades', value: grades.length.toString(), icon: Calendar, color: 'from-purple-500 to-purple-700' },
                { label: 'GPA', value: userProfile?.gpa?.toFixed(2) ?? avgGrade, icon: BarChart3, color: 'from-green-500 to-green-700' },
            ]
        } else if (role === 'lecturer') {
            const myCoursesCount = coursesData.length
            const totalStudents = coursesData.reduce((sum, c) => sum + (c.enrolled || 0), 0)
            const totalMaterials = courseMaterials.length
            const totalGrades = grades.length

            return [
                { label: 'My Courses', value: myCoursesCount.toString(), icon: Book, color: 'from-blue-500 to-blue-700' },
                { label: 'Total Students', value: totalStudents.toString(), icon: Users, color: 'from-green-500 to-green-700' },
                { label: 'Course Materials', value: totalMaterials.toString(), icon: FileText, color: 'from-purple-500 to-purple-700' },
                { label: 'Grades Entered', value: totalGrades.toString(), icon: BarChart3, color: 'from-orange-500 to-orange-700' },
            ]
        } else if (role === 'admin') {
            const totalStudents = students.length
            const totalCourses = coursesData.length
            const totalLecturers = lecturers.length
            const totalEnrollments = coursesData.reduce((sum, c) => sum + (c.enrolled || 0), 0)
            const enrollmentRate = totalCourses > 0
                ? Math.round((totalEnrollments / (totalCourses * 30)) * 100)
                : 0

            return [
                { label: 'Total Students', value: totalStudents.toLocaleString(), icon: Users, color: 'from-green-500 to-green-700' },
                { label: 'Active Courses', value: totalCourses.toString(), icon: Book, color: 'from-blue-500 to-blue-700' },
                { label: 'Faculty', value: totalLecturers.toString(), icon: Users, color: 'from-purple-500 to-purple-700' },
                { label: 'Enrollment Rate', value: `${enrollmentRate}%`, icon: BarChart3, color: 'from-orange-500 to-orange-700' },
            ]
        }

        return []
    }, [userProfile, coursesData, enrollments, grades, students, lecturers, courseMaterials])

    // Load data based on role and view
    useEffect(() => {
        if (!isAuthenticated || !userProfile) return

        const loadData = async () => {
            setLoading(true)
            try {
                const role = userProfile.role

                if (role === 'admin') {
                    // Load all courses
                    const coursesSnapshot = await getDocs(collection(db, 'courses'))
                    const coursesData = coursesSnapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }))
                    setCoursesData(coursesData)

                    // Load all students
                    const studentsSnapshot = await getDocs(query(
                        collection(db, 'users'),
                        where('role', '==', 'student')
                    ))
                    const studentsData = studentsSnapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }))
                    setStudents(studentsData)

                    // Load all lecturers
                    const lecturersSnapshot = await getDocs(query(
                        collection(db, 'users'),
                        where('role', '==', 'lecturer')
                    ))
                    const lecturersData = lecturersSnapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }))
                    setLecturers(lecturersData)
                } else if (role === 'lecturer') {
                    // Load lecturer's courses
                    const coursesSnapshot = await getDocs(query(
                        collection(db, 'courses'),
                        where('instructorId', '==', userProfile.uid)
                    ))
                    const coursesData = coursesSnapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }))
                    setCoursesData(coursesData)

                    // Load course materials for lecturer's courses
                    if (coursesData.length > 0) {
                        const courseIds = coursesData.map(c => c.id)
                        const materialsSnapshot = await getDocs(collection(db, 'materials'))
                        const materialsData = materialsSnapshot.docs
                            .map(doc => ({ id: doc.id, ...doc.data() }))
                            .filter(m => courseIds.includes(m.courseId))
                        setCourseMaterials(materialsData)
                    }

                    // Load grades for lecturer's courses
                    if (coursesData.length > 0) {
                        const courseIds = coursesData.map(c => c.id)
                        const gradesSnapshot = await getDocs(collection(db, 'grades'))
                        const gradesData = gradesSnapshot.docs
                            .map(doc => ({ id: doc.id, ...doc.data() }))
                            .filter(g => courseIds.includes(g.courseId))
                        setGrades(gradesData)
                    }
                } else if (role === 'student') {
                    // Load student's enrolled courses
                    const enrollmentsSnapshot = await getDocs(query(
                        collection(db, 'enrollments'),
                        where('studentId', '==', userProfile.uid)
                    ))
                    const enrollmentData = enrollmentsSnapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }))
                    setEnrollments(enrollmentData)

                    // Load courses for enrolled courses
                    if (enrollmentData.length > 0) {
                        const courseIds = enrollmentData.map(e => e.courseId)
                        const coursesSnapshot = await getDocs(collection(db, 'courses'))
                        const allCourses = coursesSnapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        }))
                        const enrolledCourses = allCourses.filter(c => courseIds.includes(c.id))
                        setCoursesData(enrolledCourses)

                        // Load materials for enrolled courses
                        const materialsSnapshot = await getDocs(collection(db, 'materials'))
                        const materialsData = materialsSnapshot.docs
                            .map(doc => ({ id: doc.id, ...doc.data() }))
                            .filter(m => courseIds.includes(m.courseId))
                        setCourseMaterials(materialsData)
                    } else {
                        // Show all available courses for enrollment
                        const coursesSnapshot = await getDocs(collection(db, 'courses'))
                        const coursesData = coursesSnapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        }))
                        setCoursesData(coursesData)
                        setCourseMaterials([])
                    }

                    // Load student's grades
                    const gradesSnapshot = await getDocs(query(
                        collection(db, 'grades'),
                        where('studentId', '==', userProfile.uid)
                    ))
                    const gradesData = gradesSnapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }))
                    setGrades(gradesData)
                }
            } catch (error) {
                console.error('Failed to load data', error)
            } finally {
                setLoading(false)
            }
        }

        loadData()
    }, [isAuthenticated, userProfile, currentView])

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const ref = doc(db, 'users', user.uid)
                    const snapshot = await getDoc(ref)
                    let profile
                    if (snapshot.exists()) {
                        profile = snapshot.data()
                    } else {
                        // Create default profile if it doesn't exist
                        profile = buildDefaultProfile(user)
                        await setDoc(ref, profile)
                    }
                    setUserProfile(profile)
                    setIsAuthenticated(true)
                    setLoginError('') // Clear any errors on successful login
                } catch (error) {
                    console.error('Failed to load profile', error)
                    // Even if profile load fails, still authenticate the user with a basic profile
                    const basicProfile = buildDefaultProfile(user)
                    setUserProfile(basicProfile)
                    setIsAuthenticated(true)
                    setLoginError('')
                }
            } else {
                setIsAuthenticated(false)
                setUserProfile(null)
                setLoginError('')
            }
            setLoadingSession(false)
        })

        return () => unsubscribe()
    }, [])

    const handleLogin = async (e) => {
        e.preventDefault()
        setSubmitting(true)
        setLoginError('')

        try {
            const userCredential = await signInWithEmailAndPassword(auth, loginForm.email, loginForm.password)
            console.log('Login successful:', userCredential.user.email)
            setLoginForm({ email: '', password: '' })
        } catch (error) {
            console.error('Login error:', error.code, error.message)
            setLoginError(mapAuthError(error))
        } finally {
            setSubmitting(false)
        }
    }

    const handleSignup = async (e) => {
        e.preventDefault()
        setSubmitting(true)
        setLoginError('')

        // Validate passwords match
        if (signupForm.password !== signupForm.confirmPassword) {
            setLoginError('Passwords do not match!')
            setSubmitting(false)
            return
        }

        // Validate required fields based on role
        if (signupForm.role === 'student' && (!signupForm.studentId || !signupForm.program)) {
            setLoginError('Student ID and Program are required for students.')
            setSubmitting(false)
            return
        }

        try {
            const credential = await createUserWithEmailAndPassword(
                auth,
                signupForm.email,
                signupForm.password
            )
            const profile = buildDefaultProfile(credential.user, {
                fullName: signupForm.fullName,
                role: signupForm.role,
                studentId: signupForm.studentId,
                program: signupForm.program
            })
            await setDoc(doc(db, 'users', credential.user.uid), profile)
            setSignupForm({
                fullName: '',
                email: '',
                password: '',
                confirmPassword: '',
                role: 'student',
                studentId: '',
                program: ''
            })
        } catch (error) {
            setLoginError(mapAuthError(error))
        } finally {
            setSubmitting(false)
        }
    }

    const handleLogout = async () => {
        try {
            await signOut(auth)
            setCurrentView('dashboard')
            setLoginForm({ email: '', password: '' })
            setLoginError('')
            setAuthView('login')
        } catch (error) {
            console.error('Failed to sign out', error)
        }
    }

    // CRUD Functions
    const createCourse = async () => {
        try {
            // If instructor is selected, find their ID
            let instructorId = null
            if (newCourse.instructor && lecturers.length > 0) {
                const lecturer = lecturers.find(l => l.name === newCourse.instructor || l.email === newCourse.instructor)
                if (lecturer) {
                    instructorId = lecturer.id
                }
            }

            await addDoc(collection(db, 'courses'), {
                name: newCourse.name,
                code: newCourse.code,
                instructor: newCourse.instructor || '',
                instructorId: instructorId,
                credits: newCourse.credits || 3,
                schedule: newCourse.schedule || '',
                capacity: newCourse.capacity || 30,
                enrolled: 0,
                createdAt: serverTimestamp(),
                createdBy: userProfile.uid
            })
            setShowCourseModal(false)
            setNewCourse({ name: '', code: '', instructor: '', credits: 3, schedule: '', capacity: 30 })
            // Reload data
            const coursesSnapshot = await getDocs(collection(db, 'courses'))
            const coursesData = coursesSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            setCoursesData(coursesData)
        } catch (error) {
            console.error('Failed to create course', error)
            alert('Failed to create course. Please try again.')
        }
    }

    const updateCourse = async (courseId, updates) => {
        try {
            // If instructor is being updated, find their ID
            if (updates.instructor && lecturers.length > 0) {
                const lecturer = lecturers.find(l => l.name === updates.instructor || l.email === updates.instructor)
                if (lecturer) {
                    updates.instructorId = lecturer.id
                }
            }

            await updateDoc(doc(db, 'courses', courseId), {
                ...updates,
                updatedAt: serverTimestamp()
            })
            setShowCourseModal(false)
            setSelectedCourse(null)
            // Reload data
            const coursesSnapshot = await getDocs(collection(db, 'courses'))
            const coursesData = coursesSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            setCoursesData(coursesData)
        } catch (error) {
            console.error('Failed to update course', error)
            alert('Failed to update course. Please try again.')
        }
    }

    const deleteCourse = async (courseId) => {
        if (!window.confirm('Are you sure you want to delete this course? This will also remove all enrollments and materials.')) return
        try {
            // Delete related enrollments
            const enrollmentsSnapshot = await getDocs(query(
                collection(db, 'enrollments'),
                where('courseId', '==', courseId)
            ))
            const deleteEnrollments = enrollmentsSnapshot.docs.map(doc => deleteDoc(doc.ref))
            await Promise.all(deleteEnrollments)

            // Delete related materials
            const materialsSnapshot = await getDocs(query(
                collection(db, 'materials'),
                where('courseId', '==', courseId)
            ))
            const deleteMaterials = materialsSnapshot.docs.map(doc => deleteDoc(doc.ref))
            await Promise.all(deleteMaterials)

            // Delete related grades
            const gradesSnapshot = await getDocs(query(
                collection(db, 'grades'),
                where('courseId', '==', courseId)
            ))
            const deleteGrades = gradesSnapshot.docs.map(doc => deleteDoc(doc.ref))
            await Promise.all(deleteGrades)

            // Delete the course
            await deleteDoc(doc(db, 'courses', courseId))

            // Reload data
            const coursesSnapshot = await getDocs(collection(db, 'courses'))
            const coursesData = coursesSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            setCoursesData(coursesData)
        } catch (error) {
            console.error('Failed to delete course', error)
            alert('Failed to delete course. Please try again.')
        }
    }

    const updateStudent = async (studentId, updates) => {
        try {
            await updateDoc(doc(db, 'users', studentId), {
                ...updates,
                updatedAt: serverTimestamp()
            })
            setShowStudentModal(false)
            setSelectedStudent(null)
            // Reload students
            const studentsSnapshot = await getDocs(query(
                collection(db, 'users'),
                where('role', '==', 'student')
            ))
            const studentsData = studentsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            setStudents(studentsData)
        } catch (error) {
            console.error('Failed to update student', error)
            alert('Failed to update student. Please try again.')
        }
    }

    const assignLecturerToCourse = async (courseId, lecturerId) => {
        try {
            const lecturerDoc = await getDoc(doc(db, 'users', lecturerId))
            if (!lecturerDoc.exists()) {
                alert('Lecturer not found.')
                return
            }
            const lecturerData = lecturerDoc.data()
            await updateDoc(doc(db, 'courses', courseId), {
                instructorId: lecturerId,
                instructor: lecturerData.name,
                updatedAt: serverTimestamp()
            })
            // Reload data
            const coursesSnapshot = await getDocs(collection(db, 'courses'))
            const coursesData = coursesSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            setCoursesData(coursesData)
        } catch (error) {
            console.error('Failed to assign lecturer', error)
            alert('Failed to assign lecturer. Please try again.')
        }
    }

    // Enrollment functions
    const enrollInCourse = async (courseId) => {
        try {
            // Check if already enrolled
            const existingEnrollment = enrollments.find(e => e.courseId === courseId && e.studentId === userProfile.uid)
            if (existingEnrollment) {
                alert('You are already enrolled in this course.')
                return
            }

            // Check course capacity
            const course = coursesData.find(c => c.id === courseId)
            const currentEnrollments = await getDocs(query(
                collection(db, 'enrollments'),
                where('courseId', '==', courseId)
            ))
            if (currentEnrollments.size >= (course?.capacity || 30)) {
                alert('Course is full.')
                return
            }

            await addDoc(collection(db, 'enrollments'), {
                studentId: userProfile.uid,
                courseId: courseId,
                enrolledAt: serverTimestamp(),
                status: 'active'
            })

            // Update course enrolled count
            await updateDoc(doc(db, 'courses', courseId), {
                enrolled: (course?.enrolled || 0) + 1,
                updatedAt: serverTimestamp()
            })

            // Reload enrollments and courses
            const enrollmentsSnapshot = await getDocs(query(
                collection(db, 'enrollments'),
                where('studentId', '==', userProfile.uid)
            ))
            const enrollmentData = enrollmentsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            setEnrollments(enrollmentData)

            const coursesSnapshot = await getDocs(collection(db, 'courses'))
            const allCourses = coursesSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            setCoursesData(allCourses)

            setShowEnrollmentModal(false)
        } catch (error) {
            console.error('Failed to enroll', error)
            alert('Failed to enroll in course. Please try again.')
        }
    }

    // Material functions
    const addMaterial = async () => {
        try {
            if (!newMaterial.title || !newMaterial.url) {
                alert('Please fill in all required fields.')
                return
            }
            await addDoc(collection(db, 'materials'), {
                title: newMaterial.title,
                type: newMaterial.type || 'document',
                url: newMaterial.url,
                courseId: selectedCourseForAction?.id || newMaterial.courseId,
                createdAt: serverTimestamp(),
                createdBy: userProfile.uid
            })
            setShowMaterialModal(false)
            setNewMaterial({ title: '', type: 'document', url: '', courseId: '' })
            setSelectedCourseForAction(null)

            // Reload materials
            if (selectedCourseForAction) {
                const courseIds = coursesData.map(c => c.id)
                const materialsSnapshot = await getDocs(collection(db, 'materials'))
                const materialsData = materialsSnapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .filter(m => courseIds.includes(m.courseId))
                setCourseMaterials(materialsData)
            }
        } catch (error) {
            console.error('Failed to add material', error)
            alert('Failed to add material. Please try again.')
        }
    }

    const deleteMaterial = async (materialId) => {
        if (!window.confirm('Are you sure you want to delete this material?')) return
        try {
            await deleteDoc(doc(db, 'materials', materialId))
            // Reload materials
            const courseIds = coursesData.map(c => c.id)
            const materialsSnapshot = await getDocs(collection(db, 'materials'))
            const materialsData = materialsSnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(m => courseIds.includes(m.courseId))
            setCourseMaterials(materialsData)
        } catch (error) {
            console.error('Failed to delete material', error)
            alert('Failed to delete material. Please try again.')
        }
    }

    // Grade functions
    const addGrade = async () => {
        try {
            if (!newGrade.studentId || !newGrade.grade || !newGrade.assignment) {
                alert('Please fill in all required fields.')
                return
            }
            await addDoc(collection(db, 'grades'), {
                studentId: newGrade.studentId,
                courseId: selectedCourseForAction?.id || newGrade.courseId,
                grade: parseFloat(newGrade.grade) || 0,
                assignment: newGrade.assignment,
                createdAt: serverTimestamp(),
                createdBy: userProfile.uid
            })
            setShowGradeModal(false)
            setNewGrade({ studentId: '', courseId: '', grade: '', assignment: '' })
            setSelectedCourseForAction(null)
            setEnrolledStudentsForGrade([])

            // Reload grades
            if (activeRole === 'lecturer' && selectedCourseForAction) {
                const courseIds = coursesData.map(c => c.id)
                const gradesSnapshot = await getDocs(collection(db, 'grades'))
                const gradesData = gradesSnapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .filter(g => courseIds.includes(g.courseId))
                setGrades(gradesData)
            } else if (activeRole === 'student') {
                const gradesSnapshot = await getDocs(query(
                    collection(db, 'grades'),
                    where('studentId', '==', userProfile.uid)
                ))
                const gradesData = gradesSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
                setGrades(gradesData)
            }
        } catch (error) {
            console.error('Failed to add grade', error)
            alert('Failed to add grade. Please try again.')
        }
    }

    const updateGrade = async (gradeId, updates) => {
        try {
            await updateDoc(doc(db, 'grades', gradeId), updates)
        } catch (error) {
            console.error('Failed to update grade', error)
        }
    }

    // Get enrolled students for a course
    const getEnrolledStudents = async (courseId) => {
        try {
            const enrollmentsSnapshot = await getDocs(query(
                collection(db, 'enrollments'),
                where('courseId', '==', courseId)
            ))
            const enrollmentData = enrollmentsSnapshot.docs.map(doc => doc.data())
            const studentIds = enrollmentData.map(e => e.studentId)
            const studentsData = []
            for (const studentId of studentIds) {
                const studentDoc = await getDoc(doc(db, 'users', studentId))
                if (studentDoc.exists()) {
                    studentsData.push({ id: studentDoc.id, ...studentDoc.data() })
                }
            }
            return studentsData
        } catch (error) {
            console.error('Failed to get enrolled students', error)
            return []
        }
    }

    const mapAuthError = (error) => {
        switch (error.code) {
            case 'auth/invalid-email':
                return 'The email address appears to be invalid.'
            case 'auth/user-not-found':
                return 'No account found with this email. Please sign up first.'
            case 'auth/wrong-password':
                return 'Incorrect password. Please try again.'
            case 'auth/invalid-credential':
                return 'Invalid email or password. Please check your credentials.'
            case 'auth/weak-password':
                return 'Use at least 6 characters for your password.'
            case 'auth/email-already-in-use':
                return 'This email is already registered. Please log in instead.'
            case 'auth/too-many-requests':
                return 'Too many attempts. Please wait and try again later.'
            case 'auth/network-request-failed':
                return 'Network error. Please check your internet connection.'
            default:
                return `Unable to sign you in: ${error.message || 'Please try again.'}`
        }
    }

    const activeRole = userProfile?.role ?? 'student'
    const stats = Array.isArray(statsByRole) ? statsByRole : []

    if (loadingSession) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
                <div className="text-center space-y-3">
                    <div className="h-12 w-12 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                    <p className="text-sm uppercase tracking-widest text-white/70">Loading SCMS …</p>
                </div>
            </div>
        )
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-500 flex items-center justify-center p-4">
                <div className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl shadow-xl max-w-md w-full animate-fade-in">
                    <div className="text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 shadow-md mb-4">
                            <GraduationCap className="text-white w-8 h-8" />
                        </div>
                        <h1 className="text-3xl font-bold text-gray-800">SCMS</h1>
                        <p className="text-gray-600">Student Course Management System</p>
                    </div>

                    {/* Toggle between Login and Sign Up */}
                    <div className="flex gap-2 mb-6 mt-6">
                        <button
                            onClick={() => {
                                setAuthView('login')
                                setLoginError('')
                            }}
                            className={`flex-1 py-3 rounded-lg font-semibold transition-all ${authView === 'login'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            Login
                        </button>
                        <button
                            onClick={() => {
                                setAuthView('signup')
                                setLoginError('')
                            }}
                            className={`flex-1 py-3 rounded-lg font-semibold transition-all ${authView === 'signup'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            Sign Up
                        </button>
                    </div>

                    {authView === 'login' ? (
                        <form onSubmit={handleLogin} className="space-y-5">
                            <div>
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                                    <Mail className="w-4 h-4 text-blue-500" />
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    value={loginForm.email}
                                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="your.email@usiu.ac.ke"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                                    <Lock className="w-4 h-4 text-blue-500" />
                                    Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={loginForm.password}
                                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                                        className="w-full p-3 border rounded-lg pr-10 focus:ring-2 focus:ring-blue-500"
                                        placeholder="Enter your password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-3 text-gray-500"
                                    >
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            {submitting && (
                                <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg p-3">
                                    Signing in…
                                </p>
                            )}

                            {loginError && (
                                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                                    {loginError}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full py-3 btn-gradient disabled:opacity-70 disabled:cursor-wait"
                            >
                                {submitting ? 'Signing in…' : 'Sign In'}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleSignup} className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                                    <UserCircle className="w-4 h-4 text-blue-500" />
                                    Full Name
                                </label>
                                <input
                                    type="text"
                                    value={signupForm.fullName}
                                    onChange={(e) => setSignupForm({ ...signupForm, fullName: e.target.value })}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="John Doe"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                                    <Mail className="w-4 h-4 text-blue-500" />
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    value={signupForm.email}
                                    onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="your.email@usiu.ac.ke"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                                    <Shield className="w-4 h-4 text-blue-500" />
                                    Role
                                </label>
                                <select
                                    value={signupForm.role}
                                    onChange={(e) => setSignupForm({ ...signupForm, role: e.target.value })}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                                    required
                                >
                                    <option value="student">Student</option>
                                    <option value="lecturer">Lecturer</option>
                                    <option value="admin">Administrator</option>
                                </select>
                            </div>

                            {signupForm.role === 'student' && (
                                <>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 mb-2 block">
                                            Student ID
                                        </label>
                                        <input
                                            type="text"
                                            value={signupForm.studentId}
                                            onChange={(e) => setSignupForm({ ...signupForm, studentId: e.target.value })}
                                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                            placeholder="651395"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-700 mb-2 block">
                                            Program
                                        </label>
                                        <input
                                            type="text"
                                            value={signupForm.program}
                                            onChange={(e) => setSignupForm({ ...signupForm, program: e.target.value })}
                                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                            placeholder="Applied Computer Technology"
                                            required
                                        />
                                    </div>
                                </>
                            )}

                            <div>
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                                    <Lock className="w-4 h-4 text-blue-500" />
                                    Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={signupForm.password}
                                        onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                                        className="w-full p-3 border rounded-lg pr-10 focus:ring-2 focus:ring-blue-500"
                                        placeholder="Create a strong password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-3 text-gray-500"
                                    >
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-2">
                                    <Lock className="w-4 h-4 text-blue-500" />
                                    Confirm Password
                                </label>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={signupForm.confirmPassword}
                                    onChange={(e) => setSignupForm({ ...signupForm, confirmPassword: e.target.value })}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="Re-enter your password"
                                    required
                                />
                            </div>

                            {submitting && (
                                <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg p-3">
                                    Creating account…
                                </p>
                            )}

                            {loginError && (
                                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                                    {loginError}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full py-3 btn-gradient disabled:opacity-70 disabled:cursor-wait"
                            >
                                {submitting ? 'Creating Account…' : 'Create Account'}
                            </button>
                        </form>
                    )}

                </div>
            </div>
        )
    }

    const displayUser = userProfile ?? { name: 'User', role: 'student' }
    const userInitials = (displayUser.name || 'U')
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()

    const navigationItems = [
        { label: 'Dashboard', icon: Home, view: 'dashboard' },
        {
            label:
                activeRole === 'admin'
                    ? 'Manage Courses'
                    : activeRole === 'lecturer'
                        ? 'My Courses'
                        : 'Courses',
            icon: Book,
            view: 'courses',
        },
        {
            label: activeRole === 'admin' ? 'All Students' : 'Schedule',
            icon: activeRole === 'admin' ? Users : Calendar,
            view: activeRole === 'admin' ? 'students' : 'schedule',
        },
        { label: 'Reports', icon: BarChart3, view: 'reports' },
        ...(activeRole === 'admin' ? [{ label: 'Settings', icon: Settings, view: 'settings' }] : []),
        ...(activeRole === 'student' ? [{ label: 'Profile', icon: UserCircle, view: 'profile' }] : []),
        { label: 'Logout', icon: LogOut, action: handleLogout, variant: 'danger' },
    ]

    return (
        <div className="flex h-screen bg-gray-100 overflow-hidden">
            <aside className={`${sidebarOpen ? 'w-64' : 'w-14'} bg-white shadow-xl transition-all duration-300 flex flex-col`}>
                <div className="flex items-center justify-end px-3 py-2 border-b">
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="h-10 w-10 flex items-center justify-center hover:bg-gray-200 rounded-xl transition-colors"
                    >
                        <Menu className="w-5 h-5 text-gray-600" />
                    </button>
                </div>

                <nav className={`flex-1 pb-6 ${sidebarOpen ? 'px-4 space-y-2' : 'px-2 space-y-1'}`}>
                    {sidebarOpen && (
                        <div className="pt-2 pb-4">
                            <h1 className="text-2xl font-extrabold text-blue-600">SCMS</h1>
                        </div>
                    )}
                    {navigationItems.map((item) => {
                        const isActive = !!item.view && currentView === item.view
                        const buttonClasses = [
                            'flex items-center gap-3 w-full px-4 py-3 rounded-lg font-medium transition',
                            isActive
                                ? 'bg-blue-50 text-blue-600'
                                : item.variant === 'danger'
                                    ? 'text-red-600 hover:bg-red-50 hover:text-red-600'
                                    : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600',
                        ].join(' ')

                        return (
                            <button
                                key={item.label}
                                onClick={() => (item.view ? setCurrentView(item.view) : item.action?.())}
                                className={buttonClasses}
                            >
                                <item.icon className="w-5 h-5" />
                                {sidebarOpen && item.label}
                            </button>
                        )
                    })}
                </nav>
            </aside>

            <main className="flex-1 flex flex-col overflow-hidden">
                <div className="bg-white border-b px-6 sm:px-10 py-10 shadow-sm">
                    <div className="max-w-4xl mx-auto space-y-6 text-center">
                        <div className="space-y-3">
                            <h1 className="text-3xl font-bold text-gray-800">
                                Welcome back, {displayUser.name || 'Student'}!
                            </h1>
                            <p className="text-base text-gray-500">Ready to continue your learning journey?</p>
                        </div>
                        <div className="flex flex-col items-center gap-4">
                            <div className="flex items-center gap-4 bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 shadow-sm">
                                <div className="h-14 w-14 rounded-full bg-blue-100 text-blue-600 font-semibold flex items-center justify-center text-lg">
                                    {userInitials}
                                </div>
                                <div className="text-left">
                                    <p className="text-base font-semibold text-gray-800 capitalize">{displayUser.name || 'Student'}</p>
                                    <p className="text-sm text-gray-500 capitalize">Role: {displayUser.role}</p>
                                    {displayUser.program && (
                                        <p className="text-sm text-gray-500">Program: {displayUser.program}</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-wrap justify-center gap-3 text-sm text-gray-600">
                                <span className="px-4 py-2 rounded-full bg-blue-50 text-blue-600 font-medium">
                                    Role: <span className="capitalize">{displayUser.role}</span>
                                </span>
                                {displayUser.program && (
                                    <span className="px-4 py-2 rounded-full bg-purple-50 text-purple-600 font-medium">
                                        Program: {displayUser.program}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8">
                            {loading && (
                                <div className="flex items-center justify-center h-64">
                                    <div className="text-center space-y-3">
                                        <div className="h-12 w-12 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mx-auto" />
                                        <p className="text-sm text-gray-600">Loading...</p>
                                    </div>
                                </div>
                            )}

                            {!loading && currentView === 'dashboard' && (
                                <div className="space-y-8">
                                    <header className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl p-8 text-white shadow-lg">
                                        <p className="text-sm uppercase tracking-widest text-white/60">Overview</p>
                                        <h1 className="text-3xl font-extrabold mt-2">Your campus snapshot</h1>
                                        <p className="text-blue-100 mt-1">
                                            {activeRole === 'student'
                                                ? 'Stay on top of your classes, credits, and progress.'
                                                : activeRole === 'lecturer'
                                                    ? 'Keep track of your courses and classroom updates.'
                                                    : 'Monitor key metrics to keep everything running smoothly.'}
                                        </p>
                                        <div className="mt-4 flex flex-wrap gap-3 text-sm">
                                            <span className="bg-white/15 px-4 py-2 rounded-lg">
                                                Role: <strong className="uppercase tracking-wide">{activeRole}</strong>
                                            </span>
                                            {displayUser.program && (
                                                <span className="bg-white/15 px-4 py-2 rounded-lg">
                                                    Program: <strong>{displayUser.program}</strong>
                                                </span>
                                            )}
                                        </div>
                                    </header>

                                    <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        {stats.map((item, i) => (
                                            <div
                                                key={i}
                                                className={`bg-gradient-to-br ${item.color} text-white p-6 rounded-xl shadow-lg flex items-center gap-4 card-hover`}
                                            >
                                                <item.icon className="w-8 h-8 opacity-90" />
                                                <div>
                                                    <p className="text-sm opacity-80">{item.label}</p>
                                                    <p className="text-3xl font-bold">{item.value}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </section>

                                    <section>
                                        <div className="flex justify-between items-center mb-3">
                                            <h2 className="text-2xl font-bold text-gray-800">
                                                {activeRole === 'admin' ? 'Recent Courses' : activeRole === 'lecturer' ? 'My Courses' : 'My Enrolled Courses'}
                                            </h2>
                                            <button onClick={() => setCurrentView('courses')} className="text-blue-600 font-medium hover:underline">View All</button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {activeRole === 'student' ? (
                                                coursesData
                                                    .filter(c => enrollments.some(e => e.courseId === c.id && e.studentId === userProfile.uid))
                                                    .slice(0, 2)
                                                    .map((course, i) => {
                                                        const colors = ['bg-blue-600', 'bg-orange-500', 'bg-purple-500', 'bg-green-500']
                                                        const color = colors[i % colors.length]
                                                        return (
                                                            <div key={course.id} className="bg-white rounded-xl p-6 shadow card-hover cursor-pointer" onClick={() => setCurrentView('courses')}>
                                                                <div className="flex justify-between items-center mb-4">
                                                                    <div className={`${color} w-12 h-12 rounded-xl flex items-center justify-center shadow-md`}>
                                                                        <Book className="text-white w-6 h-6" />
                                                                    </div>
                                                                    <ChevronRight className="text-gray-400" />
                                                                </div>
                                                                <h3 className="font-bold text-lg text-gray-800">{course.name || 'Unnamed Course'}</h3>
                                                                <p className="text-sm text-gray-600">by {course.instructor || 'TBA'}</p>
                                                                <div className="flex justify-between text-xs text-gray-500 mt-4">
                                                                    <span>{course.credits || 3} Credits</span>
                                                                    <span>{course.schedule || 'TBA'}</span>
                                                                </div>
                                                            </div>
                                                        )
                                                    })
                                            ) : activeRole === 'lecturer' ? (
                                                coursesData.slice(0, 2).map((course, i) => {
                                                    const colors = ['bg-blue-600', 'bg-orange-500', 'bg-purple-500', 'bg-green-500']
                                                    const color = colors[i % colors.length]
                                                    return (
                                                        <div key={course.id} className="bg-white rounded-xl p-6 shadow card-hover cursor-pointer" onClick={() => setCurrentView('courses')}>
                                                            <div className="flex justify-between items-center mb-4">
                                                                <div className={`${color} w-12 h-12 rounded-xl flex items-center justify-center shadow-md`}>
                                                                    <Book className="text-white w-6 h-6" />
                                                                </div>
                                                                <ChevronRight className="text-gray-400" />
                                                            </div>
                                                            <h3 className="font-bold text-lg text-gray-800">{course.name || 'Unnamed Course'}</h3>
                                                            <p className="text-sm text-gray-600">Code: {course.code || 'N/A'}</p>
                                                            <div className="flex justify-between text-xs text-gray-500 mt-4">
                                                                <span>{course.enrolled || 0} Students</span>
                                                                <span>{course.schedule || 'TBA'}</span>
                                                            </div>
                                                        </div>
                                                    )
                                                })
                                            ) : (
                                                coursesData.slice(0, 2).map((course, i) => {
                                                    const colors = ['bg-blue-600', 'bg-orange-500', 'bg-purple-500', 'bg-green-500']
                                                    const color = colors[i % colors.length]
                                                    return (
                                                        <div key={course.id} className="bg-white rounded-xl p-6 shadow card-hover cursor-pointer" onClick={() => setCurrentView('courses')}>
                                                            <div className="flex justify-between items-center mb-4">
                                                                <div className={`${color} w-12 h-12 rounded-xl flex items-center justify-center shadow-md`}>
                                                                    <Book className="text-white w-6 h-6" />
                                                                </div>
                                                                <ChevronRight className="text-gray-400" />
                                                            </div>
                                                            <h3 className="font-bold text-lg text-gray-800">{course.name || 'Unnamed Course'}</h3>
                                                            <p className="text-sm text-gray-600">Instructor: {course.instructor || 'TBA'}</p>
                                                            <div className="flex justify-between text-xs text-gray-500 mt-4">
                                                                <span>{course.enrolled || 0} Enrolled</span>
                                                                <span>{course.capacity || 30} Capacity</span>
                                                            </div>
                                                        </div>
                                                    )
                                                })
                                            )}
                                            {((activeRole === 'student' && coursesData.filter(c => enrollments.some(e => e.courseId === c.id && e.studentId === userProfile.uid)).length === 0) ||
                                                (activeRole === 'lecturer' && coursesData.length === 0) ||
                                                (activeRole === 'admin' && coursesData.length === 0)) && (
                                                    <div className="col-span-2 bg-white rounded-xl p-6 shadow text-center text-gray-500">
                                                        {activeRole === 'student' ? 'No enrolled courses yet. Enroll in courses to see them here.' :
                                                            activeRole === 'lecturer' ? 'No courses assigned yet.' :
                                                                'No courses created yet. Create courses to see them here.'}
                                                    </div>
                                                )}
                                        </div>
                                    </section>

                                    <section className="bg-white p-6 rounded-xl shadow space-y-4">
                                        <div className="flex justify-between items-center">
                                            <h2 className="text-xl font-bold text-gray-800">Today&apos;s Schedule</h2>
                                            <button onClick={() => setCurrentView('schedule')} className="text-sm text-blue-600 hover:text-blue-700 font-medium">View Calendar</button>
                                        </div>
                                        <div className="space-y-3">
                                            {activeRole === 'student' ? (
                                                coursesData
                                                    .filter(c => enrollments.some(e => e.courseId === c.id && e.studentId === userProfile.uid))
                                                    .slice(0, 3)
                                                    .map((course, i) => {
                                                        const colors = ['bg-blue-600', 'bg-orange-500', 'bg-purple-500', 'bg-green-500', 'bg-pink-500']
                                                        const color = colors[i % colors.length]
                                                        return (
                                                            <div key={course.id} className="flex gap-4 items-center bg-gray-50 border rounded-lg p-3 hover:bg-gray-100 transition">
                                                                <div className={`${color} w-2 h-10 rounded-full`} />
                                                                <div>
                                                                    <p className="font-semibold text-gray-800">{course.name || 'Unnamed Course'}</p>
                                                                    <p className="text-sm text-gray-600">{course.schedule || 'TBA'}</p>
                                                                    <p className="text-xs text-gray-500">Code: {course.code || 'N/A'}</p>
                                                                </div>
                                                            </div>
                                                        )
                                                    })
                                            ) : activeRole === 'lecturer' ? (
                                                coursesData.slice(0, 3).map((course, i) => {
                                                    const colors = ['bg-blue-600', 'bg-orange-500', 'bg-purple-500', 'bg-green-500']
                                                    const color = colors[i % colors.length]
                                                    return (
                                                        <div key={course.id} className="flex gap-4 items-center bg-gray-50 border rounded-lg p-3 hover:bg-gray-100 transition">
                                                            <div className={`${color} w-2 h-10 rounded-full`} />
                                                            <div>
                                                                <p className="font-semibold text-gray-800">{course.name || 'Unnamed Course'}</p>
                                                                <p className="text-sm text-gray-600">{course.schedule || 'TBA'}</p>
                                                                <p className="text-xs text-gray-500">{course.enrolled || 0} students</p>
                                                            </div>
                                                        </div>
                                                    )
                                                })
                                            ) : (
                                                coursesData.slice(0, 3).map((course, i) => {
                                                    const colors = ['bg-blue-600', 'bg-orange-500', 'bg-purple-500', 'bg-green-500']
                                                    const color = colors[i % colors.length]
                                                    return (
                                                        <div key={course.id} className="flex gap-4 items-center bg-gray-50 border rounded-lg p-3 hover:bg-gray-100 transition">
                                                            <div className={`${color} w-2 h-10 rounded-full`} />
                                                            <div>
                                                                <p className="font-semibold text-gray-800">{course.name || 'Unnamed Course'}</p>
                                                                <p className="text-sm text-gray-600">{course.schedule || 'TBA'}</p>
                                                                <p className="text-xs text-gray-500">{course.enrolled || 0}/{course.capacity || 30} enrolled</p>
                                                            </div>
                                                        </div>
                                                    )
                                                })
                                            )}
                                            {((activeRole === 'student' && coursesData.filter(c => enrollments.some(e => e.courseId === c.id && e.studentId === userProfile.uid)).length === 0) ||
                                                (activeRole === 'lecturer' && coursesData.length === 0) ||
                                                (activeRole === 'admin' && coursesData.length === 0)) && (
                                                    <div className="text-center text-gray-500 py-4">
                                                        No scheduled courses
                                                    </div>
                                                )}
                                        </div>
                                    </section>
                                </div>
                            )}

                            {!loading && currentView === 'courses' && activeRole === 'admin' && (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center">
                                        <h1 className="text-3xl font-bold text-gray-800">Manage Courses</h1>
                                        <button
                                            onClick={() => {
                                                setSelectedCourse(null)
                                                setNewCourse({ name: '', code: '', instructor: '', credits: 3, schedule: '', capacity: 30 })
                                                setShowCourseModal(true)
                                            }}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                                        >
                                            <Book className="w-4 h-4" />
                                            Add Course
                                        </button>
                                    </div>

                                    <div className="bg-white rounded-xl shadow p-6">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                            <input
                                                type="text"
                                                placeholder="Search courses..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>

                                        <div className="overflow-x-auto">
                                            <table className="w-full">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="p-3 text-left text-sm font-semibold text-gray-700">Course Code</th>
                                                        <th className="p-3 text-left text-sm font-semibold text-gray-700">Name</th>
                                                        <th className="p-3 text-left text-sm font-semibold text-gray-700">Instructor</th>
                                                        <th className="p-3 text-left text-sm font-semibold text-gray-700">Enrolled</th>
                                                        <th className="p-3 text-left text-sm font-semibold text-gray-700">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {coursesData.filter(c =>
                                                        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                                        c.code?.toLowerCase().includes(searchTerm.toLowerCase())
                                                    ).map(course => (
                                                        <tr key={course.id} className="border-b hover:bg-gray-50">
                                                            <td className="p-3">{course.code || 'N/A'}</td>
                                                            <td className="p-3 font-medium">{course.name || 'Unnamed Course'}</td>
                                                            <td className="p-3">{course.instructor || 'Unassigned'}</td>
                                                            <td className="p-3">{course.enrolled || 0} / {course.capacity || 30}</td>
                                                            <td className="p-3">
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => {
                                                                            setSelectedCourse(course)
                                                                            setNewCourse(course)
                                                                            setShowCourseModal(true)
                                                                        }}
                                                                        className="px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                                                                    >
                                                                        Edit
                                                                    </button>
                                                                    <button
                                                                        onClick={() => deleteCourse(course.id)}
                                                                        className="px-3 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100"
                                                                    >
                                                                        Delete
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!loading && currentView === 'students' && activeRole === 'admin' && (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center">
                                        <h1 className="text-3xl font-bold text-gray-800">All Students</h1>
                                    </div>

                                    <div className="bg-white rounded-xl shadow p-6">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                            <input
                                                type="text"
                                                placeholder="Search students..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                            <select
                                                value={filterProgram}
                                                onChange={(e) => setFilterProgram(e.target.value)}
                                                className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="">All Programs</option>
                                                {[...new Set(students.map(s => s.program).filter(Boolean))].map(prog => (
                                                    <option key={prog} value={prog}>{prog}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="overflow-x-auto">
                                            <table className="w-full">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="p-3 text-left text-sm font-semibold text-gray-700">Student ID</th>
                                                        <th className="p-3 text-left text-sm font-semibold text-gray-700">Name</th>
                                                        <th className="p-3 text-left text-sm font-semibold text-gray-700">Email</th>
                                                        <th className="p-3 text-left text-sm font-semibold text-gray-700">Program</th>
                                                        <th className="p-3 text-left text-sm font-semibold text-gray-700">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {students.filter(s => {
                                                        const matchesSearch = !searchTerm ||
                                                            s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                                            s.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                                            s.studentId?.includes(searchTerm)
                                                        const matchesProgram = !filterProgram || s.program === filterProgram
                                                        return matchesSearch && matchesProgram
                                                    }).map(student => (
                                                        <tr key={student.id} className="border-b hover:bg-gray-50">
                                                            <td className="p-3">{student.studentId || 'N/A'}</td>
                                                            <td className="p-3 font-medium">{student.name}</td>
                                                            <td className="p-3">{student.email}</td>
                                                            <td className="p-3">{student.program || 'N/A'}</td>
                                                            <td className="p-3">
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedStudent(student)
                                                                        setShowStudentModal(true)
                                                                    }}
                                                                    className="px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                                                                >
                                                                    Edit
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!loading && currentView === 'reports' && (
                                <div className="space-y-6">
                                    <h1 className="text-3xl font-bold text-gray-800">Reports & Analytics</h1>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {activeRole === 'admin' && (
                                            <>
                                                <div className="bg-white rounded-xl shadow p-6">
                                                    <h3 className="text-xl font-bold text-gray-800 mb-4">System Overview</h3>
                                                    <div className="space-y-3">
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-600">Total Students:</span>
                                                            <span className="font-semibold">{students.length}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-600">Total Courses:</span>
                                                            <span className="font-semibold">{coursesData.length}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-600">Total Lecturers:</span>
                                                            <span className="font-semibold">{lecturers.length}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-600">Total Enrollments:</span>
                                                            <span className="font-semibold">
                                                                {coursesData.reduce((sum, c) => sum + (c.enrolled || 0), 0)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="bg-white rounded-xl shadow p-6">
                                                    <h3 className="text-xl font-bold text-gray-800 mb-4">Course Statistics</h3>
                                                    <div className="space-y-3">
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-600">Average Enrollment:</span>
                                                            <span className="font-semibold">
                                                                {coursesData.length > 0
                                                                    ? (coursesData.reduce((sum, c) => sum + (c.enrolled || 0), 0) / coursesData.length).toFixed(1)
                                                                    : 0}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-600">Full Courses:</span>
                                                            <span className="font-semibold">
                                                                {coursesData.filter(c => (c.enrolled || 0) >= (c.capacity || 30)).length}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-600">Available Spots:</span>
                                                            <span className="font-semibold">
                                                                {coursesData.reduce((sum, c) => sum + ((c.capacity || 30) - (c.enrolled || 0)), 0)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                        {activeRole === 'lecturer' && (
                                            <div className="bg-white rounded-xl shadow p-6">
                                                <h3 className="text-xl font-bold text-gray-800 mb-4">Teaching Statistics</h3>
                                                <div className="space-y-3">
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">My Courses:</span>
                                                        <span className="font-semibold">{coursesData.length}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">Total Students:</span>
                                                        <span className="font-semibold">
                                                            {coursesData.reduce((sum, c) => sum + (c.enrolled || 0), 0)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">Course Materials:</span>
                                                        <span className="font-semibold">{courseMaterials.length}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">Grades Entered:</span>
                                                        <span className="font-semibold">{grades.length}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {activeRole === 'student' && (
                                            <div className="bg-white rounded-xl shadow p-6">
                                                <h3 className="text-xl font-bold text-gray-800 mb-4">Academic Progress</h3>
                                                <div className="space-y-3">
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">Enrolled Courses:</span>
                                                        <span className="font-semibold">{enrollments.length}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">Total Grades:</span>
                                                        <span className="font-semibold">{grades.length}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">Average Grade:</span>
                                                        <span className="font-semibold">
                                                            {grades.length > 0
                                                                ? (grades.reduce((sum, g) => sum + parseFloat(g.grade || 0), 0) / grades.length).toFixed(1)
                                                                : 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">GPA:</span>
                                                        <span className="font-semibold">{userProfile?.gpa || 'N/A'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {!loading && currentView === 'settings' && activeRole === 'admin' && (
                                <div className="space-y-6">
                                    <h1 className="text-3xl font-bold text-gray-800">System Settings</h1>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="bg-white rounded-xl shadow p-6">
                                            <h3 className="text-xl font-bold text-gray-800 mb-4">Course Settings</h3>
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">Default Course Capacity</label>
                                                    <input
                                                        type="number"
                                                        defaultValue="30"
                                                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">Default Credits</label>
                                                    <input
                                                        type="number"
                                                        defaultValue="3"
                                                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                                    Save Course Settings
                                                </button>
                                            </div>
                                        </div>
                                        <div className="bg-white rounded-xl shadow p-6">
                                            <h3 className="text-xl font-bold text-gray-800 mb-4">User Management</h3>
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-700">Total Users:</span>
                                                    <span className="font-semibold">{students.length + lecturers.length + 1}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-700">Students:</span>
                                                    <span className="font-semibold">{students.length}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-700">Lecturers:</span>
                                                    <span className="font-semibold">{lecturers.length}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-700">Admins:</span>
                                                    <span className="font-semibold">1</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-white rounded-xl shadow p-6">
                                            <h3 className="text-xl font-bold text-gray-800 mb-4">System Information</h3>
                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">Version:</span>
                                                    <span className="text-gray-800">1.0.0</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">Database:</span>
                                                    <span className="text-gray-800">Firebase Firestore</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">Last Backup:</span>
                                                    <span className="text-gray-800">Today</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!loading && currentView === 'profile' && activeRole === 'student' && (
                                <div className="space-y-6">
                                    <h1 className="text-3xl font-bold text-gray-800">My Profile</h1>
                                    <div className="bg-white rounded-xl shadow p-6">
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                                                <input
                                                    type="text"
                                                    value={userProfile?.name || ''}
                                                    onChange={(e) => {
                                                        const updated = { ...userProfile, name: e.target.value }
                                                        setUserProfile(updated)
                                                    }}
                                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Student ID</label>
                                                <input
                                                    type="text"
                                                    value={userProfile?.studentId || ''}
                                                    onChange={(e) => {
                                                        const updated = { ...userProfile, studentId: e.target.value }
                                                        setUserProfile(updated)
                                                    }}
                                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Program</label>
                                                <input
                                                    type="text"
                                                    value={userProfile?.program || ''}
                                                    onChange={(e) => {
                                                        const updated = { ...userProfile, program: e.target.value }
                                                        setUserProfile(updated)
                                                    }}
                                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
                                                <select
                                                    value={userProfile?.year || ''}
                                                    onChange={(e) => {
                                                        const updated = { ...userProfile, year: e.target.value }
                                                        setUserProfile(updated)
                                                    }}
                                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                                >
                                                    <option value="">Select Year</option>
                                                    <option value="1st Year">1st Year</option>
                                                    <option value="2nd Year">2nd Year</option>
                                                    <option value="3rd Year">3rd Year</option>
                                                    <option value="4th Year">4th Year</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">GPA</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    max="4"
                                                    value={userProfile?.gpa || ''}
                                                    onChange={(e) => {
                                                        const updated = { ...userProfile, gpa: parseFloat(e.target.value) || 0 }
                                                        setUserProfile(updated)
                                                    }}
                                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                                                <input
                                                    type="email"
                                                    value={userProfile?.email || ''}
                                                    disabled
                                                    className="w-full p-3 border rounded-lg bg-gray-50"
                                                />
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await updateDoc(doc(db, 'users', userProfile.uid), {
                                                            name: userProfile.name,
                                                            studentId: userProfile.studentId,
                                                            program: userProfile.program,
                                                            year: userProfile.year,
                                                            gpa: userProfile.gpa
                                                        })
                                                        alert('Profile updated successfully!')
                                                    } catch (error) {
                                                        console.error('Failed to update profile', error)
                                                        alert('Failed to update profile. Please try again.')
                                                    }
                                                }}
                                                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                            >
                                                Save Profile
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!loading && currentView === 'schedule' && (
                                <div className="space-y-6">
                                    <h1 className="text-3xl font-bold text-gray-800">Schedule</h1>
                                    <div className="bg-white rounded-xl shadow p-6">
                                        {activeRole === 'student' && coursesData.length > 0 ? (
                                            <div className="space-y-3">
                                                {coursesData.filter(c => enrollments.some(e => e.courseId === c.id && e.studentId === userProfile.uid)).map((course, i) => {
                                                    const colors = ['bg-blue-600', 'bg-orange-500', 'bg-purple-500', 'bg-green-500', 'bg-pink-500']
                                                    const color = colors[i % colors.length]
                                                    return (
                                                        <div key={course.id} className="flex gap-4 items-center bg-gray-50 border rounded-lg p-4 hover:bg-gray-100 transition">
                                                            <div className={`${color} w-2 h-12 rounded-full`} />
                                                            <div className="flex-1">
                                                                <p className="font-semibold text-gray-800">{course.name || 'Unnamed Course'}</p>
                                                                <p className="text-sm text-gray-600">{course.schedule || 'TBA'}</p>
                                                                <p className="text-xs text-gray-500">Code: {course.code || 'N/A'}</p>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        ) : activeRole === 'lecturer' && coursesData.length > 0 ? (
                                            <div className="space-y-3">
                                                {coursesData.map((course, i) => {
                                                    const colors = ['bg-blue-600', 'bg-orange-500', 'bg-purple-500', 'bg-green-500']
                                                    const color = colors[i % colors.length]
                                                    return (
                                                        <div key={course.id} className="flex gap-4 items-center bg-gray-50 border rounded-lg p-4 hover:bg-gray-100 transition">
                                                            <div className={`${color} w-2 h-12 rounded-full`} />
                                                            <div className="flex-1">
                                                                <p className="font-semibold text-gray-800">{course.name || 'Unnamed Course'}</p>
                                                                <p className="text-sm text-gray-600">{course.schedule || 'TBA'}</p>
                                                                <p className="text-xs text-gray-500">Code: {course.code || 'N/A'} • Students: {course.enrolled || 0}</p>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-center text-gray-500 py-4">
                                                No scheduled courses
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {!loading && currentView === 'courses' && activeRole === 'lecturer' && (
                                <div className="space-y-6">
                                    <h1 className="text-3xl font-bold text-gray-800">My Courses</h1>
                                    <div className="grid grid-cols-1 gap-6">
                                        {coursesData.length > 0 ? coursesData.map(course => {
                                            const courseMaterialsList = courseMaterials.filter(m => m.courseId === course.id)
                                            const courseGrades = grades.filter(g => g.courseId === course.id)
                                            return (
                                                <div key={course.id} className="bg-white rounded-xl p-6 shadow-lg">
                                                    <div className="flex justify-between items-start mb-4">
                                                        <div className="flex items-center gap-4">
                                                            <div className="bg-blue-600 w-12 h-12 rounded-xl flex items-center justify-center shadow-md">
                                                                <Book className="text-white w-6 h-6" />
                                                            </div>
                                                            <div>
                                                                <h3 className="font-bold text-lg text-gray-800">{course.name || 'Unnamed Course'}</h3>
                                                                <p className="text-sm text-gray-600">Code: {course.code || 'N/A'}</p>
                                                                <p className="text-sm text-gray-500">Schedule: {course.schedule || 'TBA'}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-4 mb-4">
                                                        <div className="bg-blue-50 p-3 rounded-lg">
                                                            <p className="text-sm text-gray-600">Enrolled</p>
                                                            <p className="text-xl font-bold text-blue-600">{course.enrolled || 0}/{course.capacity || 30}</p>
                                                        </div>
                                                        <div className="bg-green-50 p-3 rounded-lg">
                                                            <p className="text-sm text-gray-600">Materials</p>
                                                            <p className="text-xl font-bold text-green-600">{courseMaterialsList.length}</p>
                                                        </div>
                                                        <div className="bg-orange-50 p-3 rounded-lg">
                                                            <p className="text-sm text-gray-600">Grades</p>
                                                            <p className="text-xl font-bold text-orange-600">{courseGrades.length}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2 flex-wrap">
                                                        <button
                                                            onClick={async () => {
                                                                const enrolledStudents = await getEnrolledStudents(course.id)
                                                                alert(`Enrolled Students: ${enrolledStudents.length}\n${enrolledStudents.map(s => `- ${s.name} (${s.studentId || s.email})`).join('\n')}`)
                                                            }}
                                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                                                        >
                                                            View Students
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setSelectedCourseForAction(course)
                                                                setShowMaterialModal(true)
                                                            }}
                                                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                                                        >
                                                            Add Material
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                setSelectedCourseForAction(course)
                                                                const enrolled = await getEnrolledStudents(course.id)
                                                                setEnrolledStudentsForGrade(enrolled)
                                                                setShowGradeModal(true)
                                                            }}
                                                            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm"
                                                        >
                                                            Add Grade
                                                        </button>
                                                    </div>
                                                    {courseMaterialsList.length > 0 && (
                                                        <div className="mt-4 pt-4 border-t">
                                                            <h4 className="font-semibold text-gray-700 mb-2">Course Materials</h4>
                                                            <div className="space-y-2">
                                                                {courseMaterialsList.map(material => (
                                                                    <div key={material.id} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                                                                        <div>
                                                                            <p className="text-sm font-medium">{material.title}</p>
                                                                            <p className="text-xs text-gray-500">{material.type}</p>
                                                                        </div>
                                                                        <button
                                                                            onClick={() => deleteMaterial(material.id)}
                                                                            className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200"
                                                                        >
                                                                            Delete
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        }) : (
                                            <p className="text-gray-600">No courses assigned yet.</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {!loading && currentView === 'courses' && activeRole === 'student' && (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center">
                                        <h1 className="text-3xl font-bold text-gray-800">My Courses</h1>
                                        <button
                                            onClick={() => setShowEnrollmentModal(true)}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                                        >
                                            <Book className="w-4 h-4" />
                                            Enroll in Course
                                        </button>
                                    </div>

                                    {coursesData.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {coursesData.map(course => {
                                                const isEnrolled = enrollments.some(e => e.courseId === course.id && e.studentId === userProfile.uid)
                                                const courseGrades = grades.filter(g => g.courseId === course.id && g.studentId === userProfile.uid)
                                                const courseMaterialsList = courseMaterials.filter(m => m.courseId === course.id)
                                                const avgGrade = courseGrades.length > 0
                                                    ? (courseGrades.reduce((sum, g) => sum + parseFloat(g.grade || 0), 0) / courseGrades.length).toFixed(1)
                                                    : 'N/A'

                                                return (
                                                    <div key={course.id} className="bg-white rounded-xl p-6 shadow card-hover">
                                                        <div className="flex justify-between items-center mb-4">
                                                            <div className="bg-blue-600 w-12 h-12 rounded-xl flex items-center justify-center shadow-md">
                                                                <Book className="text-white w-6 h-6" />
                                                            </div>
                                                            {isEnrolled && (
                                                                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                                                                    Enrolled
                                                                </span>
                                                            )}
                                                        </div>
                                                        <h3 className="font-bold text-lg text-gray-800">{course.name || 'Unnamed Course'}</h3>
                                                        <p className="text-sm text-gray-600">Code: {course.code || 'N/A'}</p>
                                                        <p className="text-sm text-gray-500">Instructor: {course.instructor || 'TBA'}</p>
                                                        <div className="mt-4 space-y-2">
                                                            <div className="flex justify-between text-sm">
                                                                <span className="text-gray-600">Schedule:</span>
                                                                <span className="text-gray-800">{course.schedule || 'TBA'}</span>
                                                            </div>
                                                            <div className="flex justify-between text-sm">
                                                                <span className="text-gray-600">Credits:</span>
                                                                <span className="text-gray-800">{course.credits || 3}</span>
                                                            </div>
                                                            {isEnrolled && (
                                                                <div className="flex justify-between text-sm">
                                                                    <span className="text-gray-600">Average Grade:</span>
                                                                    <span className="text-gray-800 font-semibold">{avgGrade}</span>
                                                                </div>
                                                            )}
                                                            <div className="flex justify-between text-sm">
                                                                <span className="text-gray-600">Enrolled:</span>
                                                                <span className="text-gray-800">{course.enrolled || 0}/{course.capacity || 30}</span>
                                                            </div>
                                                        </div>
                                                        {isEnrolled && courseMaterialsList.length > 0 && (
                                                            <div className="mt-4 pt-4 border-t">
                                                                <h4 className="font-semibold text-gray-700 mb-2">Course Materials</h4>
                                                                <div className="space-y-2">
                                                                    {courseMaterialsList.map(material => (
                                                                        <div key={material.id} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                                                                            <div>
                                                                                <p className="text-sm font-medium">{material.title}</p>
                                                                                <p className="text-xs text-gray-500 capitalize">{material.type}</p>
                                                                            </div>
                                                                            <a
                                                                                href={material.url}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                                                            >
                                                                                Open
                                                                            </a>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {!isEnrolled && (
                                                            <button
                                                                onClick={() => enrollInCourse(course.id)}
                                                                className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                                            >
                                                                Enroll Now
                                                            </button>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <div className="bg-white rounded-xl shadow p-6 text-center">
                                            <p className="text-gray-600">No courses available. Check back later or contact your administrator.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
              
            </main>

            {/* Course Modal */}
            {showCourseModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                        <h2 className="text-2xl font-bold text-gray-800 mb-4">
                            {selectedCourse ? 'Edit Course' : 'Create New Course'}
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Course Code</label>
                                <input
                                    type="text"
                                    value={newCourse.code}
                                    onChange={(e) => setNewCourse({ ...newCourse, code: e.target.value })}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="MATH301"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Course Name</label>
                                <input
                                    type="text"
                                    value={newCourse.name}
                                    onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="Advanced Mathematics"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Instructor</label>
                                {activeRole === 'admin' && lecturers.length > 0 ? (
                                    <select
                                        value={newCourse.instructor}
                                        onChange={(e) => setNewCourse({ ...newCourse, instructor: e.target.value })}
                                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Select Lecturer</option>
                                        {lecturers.map(lecturer => (
                                            <option key={lecturer.id} value={lecturer.name}>
                                                {lecturer.name} ({lecturer.email})
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        value={newCourse.instructor}
                                        onChange={(e) => setNewCourse({ ...newCourse, instructor: e.target.value })}
                                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="Dr. Sarah Johnson"
                                    />
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Credits</label>
                                    <input
                                        type="number"
                                        value={newCourse.credits}
                                        onChange={(e) => setNewCourse({ ...newCourse, credits: parseInt(e.target.value) })}
                                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                        min="1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Capacity</label>
                                    <input
                                        type="number"
                                        value={newCourse.capacity}
                                        onChange={(e) => setNewCourse({ ...newCourse, capacity: parseInt(e.target.value) })}
                                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                        min="1"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Schedule</label>
                                <input
                                    type="text"
                                    value={newCourse.schedule}
                                    onChange={(e) => setNewCourse({ ...newCourse, schedule: e.target.value })}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="Mon, Wed, Fri 9:00-10:30"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowCourseModal(false)
                                    setSelectedCourse(null)
                                }}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (selectedCourse) {
                                        updateCourse(selectedCourse.id, newCourse)
                                    } else {
                                        createCourse()
                                    }
                                }}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                {selectedCourse ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Student Modal */}
            {showStudentModal && selectedStudent && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                        <h2 className="text-2xl font-bold text-gray-800 mb-4">Edit Student</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                                <input
                                    type="text"
                                    value={selectedStudent.name || ''}
                                    onChange={(e) => setSelectedStudent({ ...selectedStudent, name: e.target.value })}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Student ID</label>
                                <input
                                    type="text"
                                    value={selectedStudent.studentId || ''}
                                    onChange={(e) => setSelectedStudent({ ...selectedStudent, studentId: e.target.value })}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Program</label>
                                <input
                                    type="text"
                                    value={selectedStudent.program || ''}
                                    onChange={(e) => setSelectedStudent({ ...selectedStudent, program: e.target.value })}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                                <input
                                    type="email"
                                    value={selectedStudent.email || ''}
                                    disabled
                                    className="w-full p-3 border rounded-lg bg-gray-50"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowStudentModal(false)
                                    setSelectedStudent(null)
                                }}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    updateStudent(selectedStudent.id, {
                                        name: selectedStudent.name,
                                        studentId: selectedStudent.studentId,
                                        program: selectedStudent.program
                                    })
                                }}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                Update
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Material Modal */}
            {showMaterialModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                        <h2 className="text-2xl font-bold text-gray-800 mb-4">Add Course Material</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                                <input
                                    type="text"
                                    value={newMaterial.title}
                                    onChange={(e) => setNewMaterial({ ...newMaterial, title: e.target.value })}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="Lecture Notes - Week 1"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                                <select
                                    value={newMaterial.type}
                                    onChange={(e) => setNewMaterial({ ...newMaterial, type: e.target.value })}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="document">Document</option>
                                    <option value="video">Video</option>
                                    <option value="link">Link</option>
                                    <option value="assignment">Assignment</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">URL/Link</label>
                                <input
                                    type="text"
                                    value={newMaterial.url}
                                    onChange={(e) => setNewMaterial({ ...newMaterial, url: e.target.value })}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="https://..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Upload file from your computer</label>
                                <input
                                    type="file"
                                    onChange={(e) => {
                                        const file = e.target.files && e.target.files[0] ? e.target.files[0] : null
                                        if (!file) return
                                        setMaterialFile(file)
                                        // Auto-start upload
                                        try {
                                            setUploadingMaterial(true)
                                            setUploadProgress(0)
                                            const courseFolder = (selectedCourseForAction?.id || 'general')
                                            const path = `materials/${courseFolder}/${Date.now()}_${file.name}`
                                            const ref = storageRef(storage, path)
                                            const task = uploadBytesResumable(ref, file)
                                            task.on('state_changed',
                                                (snapshot) => {
                                                    const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
                                                    setUploadProgress(pct)
                                                },
                                                (error) => {
                                                    console.error('Upload failed', error)
                                                    alert('File upload failed. Please try again.')
                                                    setUploadingMaterial(false)
                                                },
                                                async () => {
                                                    const downloadUrl = await getDownloadURL(task.snapshot.ref)
                                                    setNewMaterial(prev => ({ ...prev, url: downloadUrl }))
                                                    setUploadingMaterial(false)
                                                }
                                            )
                                        } catch (err) {
                                            console.error('Upload init error', err)
                                            alert('Could not start upload.')
                                            setUploadingMaterial(false)
                                        }
                                    }}
                                    className="w-full"
                                />
                                {uploadingMaterial && (
                                    <div className="mt-2">
                                        <div className="w-full bg-gray-200 rounded h-2">
                                            <div className="bg-blue-600 h-2 rounded" style={{ width: `${uploadProgress}%` }} />
                                        </div>
                                        <p className="text-xs text-gray-600 mt-1">Uploading… {uploadProgress}%</p>
                                    </div>
                                )}
                                {!uploadingMaterial && newMaterial.url && materialFile && (
                                    <p className="text-xs text-green-600 mt-2">File uploaded. URL attached.</p>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowMaterialModal(false)
                                    setSelectedCourseForAction(null)
                                    setNewMaterial({ title: '', type: 'document', url: '', courseId: '' })
                                    setMaterialFile(null)
                                    setUploadProgress(0)
                                    setUploadingMaterial(false)
                                }}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={addMaterial}
                                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                                disabled={uploadingMaterial}
                            >
                                Add Material
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Grade Modal */}
            {showGradeModal && selectedCourseForAction && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                        <h2 className="text-2xl font-bold text-gray-800 mb-4">Add Grade</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Course</label>
                                <input
                                    type="text"
                                    value={selectedCourseForAction.name || ''}
                                    disabled
                                    className="w-full p-3 border rounded-lg bg-gray-50"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Student</label>
                                <select
                                    value={newGrade.studentId}
                                    onChange={(e) => setNewGrade({ ...newGrade, studentId: e.target.value })}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Select Student</option>
                                    {(activeRole === 'admin' ? students : enrolledStudentsForGrade).map(student => (
                                        <option key={student.id} value={student.id}>
                                            {student.name} ({student.studentId || student.email})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Assignment/Exam</label>
                                <input
                                    type="text"
                                    value={newGrade.assignment}
                                    onChange={(e) => setNewGrade({ ...newGrade, assignment: e.target.value })}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="Midterm Exam"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Grade</label>
                                <input
                                    type="number"
                                    value={newGrade.grade}
                                    onChange={(e) => setNewGrade({ ...newGrade, grade: e.target.value })}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="85"
                                    min="0"
                                    max="100"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowGradeModal(false)
                                    setSelectedCourseForAction(null)
                                    setEnrolledStudentsForGrade([])
                                    setNewGrade({ studentId: '', courseId: '', grade: '', assignment: '' })
                                }}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={addGrade}
                                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                            >
                                Add Grade
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Enrollment Modal */}
            {showEnrollmentModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                        <h2 className="text-2xl font-bold text-gray-800 mb-4">Enroll in Course</h2>
                        <div className="space-y-4">
                            {coursesData.filter(course => {
                                const isEnrolled = enrollments.some(e => e.courseId === course.id && e.studentId === userProfile.uid)
                                return !isEnrolled
                            }).length > 0 ? (
                                coursesData.filter(course => {
                                    const isEnrolled = enrollments.some(e => e.courseId === course.id && e.studentId === userProfile.uid)
                                    return !isEnrolled
                                }).map(course => (
                                    <div key={course.id} className="border rounded-lg p-4 hover:bg-gray-50">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <h3 className="font-semibold text-gray-800">{course.name || 'Unnamed Course'}</h3>
                                                <p className="text-sm text-gray-600">Code: {course.code || 'N/A'}</p>
                                                <p className="text-sm text-gray-500">Instructor: {course.instructor || 'TBA'}</p>
                                                <p className="text-sm text-gray-500">Available: {((course.capacity || 30) - (course.enrolled || 0))} spots</p>
                                            </div>
                                            <button
                                                onClick={() => enrollInCourse(course.id)}
                                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                            >
                                                Enroll
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-gray-600">No available courses to enroll in.</p>
                            )}
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowEnrollmentModal(false)}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default SCMS
