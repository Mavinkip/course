import { initializeApp } from 'firebase/app'
import { getAnalytics, isSupported } from 'firebase/analytics'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
	apiKey: "AIzaSyCHxGQZjRjKtx5lJ7uUDB-hG22h7V57mRQ",
	authDomain: "the-host-6761b.firebaseapp.com",
	projectId: "the-host-6761b",
	storageBucket: "the-host-6761b.appspot.com",
	messagingSenderId: "903052396680",
	appId: "1:903052396680:web:7b72983aeb38559a3ef73d",
	measurementId: "G-W3FYK0D7YC"
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

let analytics
if (typeof window !== 'undefined') {
	isSupported()
		.then(supported => {
			if (supported) {
				analytics = getAnalytics(app)
			}
		})
		.catch(() => {
			// analytics unsupported, ignore
		})
}

export { app, auth, db, analytics }


