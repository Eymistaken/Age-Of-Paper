package com.ageofpaper.android.data

import android.content.Context
import com.ageofpaper.android.data.demo.DemoRoomRepository
import com.ageofpaper.android.data.firestore.FirestoreRoomRepository
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore

/**
 * Firebase project settings, mirroring `src/config/firebase.js`.
 *
 * The `google-services` Gradle plugin is deliberately not used: the repository
 * builds and runs without any credential file, and the app falls back to the
 * offline demo repository until a real Android application id is filled in
 * below. See `android/README.md` for the one manual step.
 */
object FirebaseConfig {
    const val API_KEY = "AIzaSyC3_3GnZIv78PEVsLGjSv_k31ai8fZjmL8"
    const val PROJECT_ID = "eymistaken"
    const val STORAGE_BUCKET = "eymistaken.firebasestorage.app"
    const val SENDER_ID = "677072278270"

    /**
     * Register an Android app in the Firebase console for `eymistaken` and paste
     * its application id here (it looks like `1:677072278270:android:...`).
     * The web application id does not work for an Android client.
     */
    const val ANDROID_APPLICATION_ID = "PASTE_ANDROID_APP_ID_HERE"

    val isConfigured: Boolean
        get() = ANDROID_APPLICATION_ID.startsWith("1:") && ANDROID_APPLICATION_ID.contains(":android:")
}

/** Which backend the running app is talking to. */
enum class BackendMode { FIRESTORE, DEMO }

/** Simple service locator; the app has a single repository and no DI framework. */
class AppContainer(context: Context) {

    val backendMode: BackendMode
    val roomRepository: RoomRepository

    init {
        val firestoreRepository = if (FirebaseConfig.isConfigured) {
            runCatching { createFirestoreRepository(context) }.getOrNull()
        } else {
            null
        }
        if (firestoreRepository != null) {
            backendMode = BackendMode.FIRESTORE
            roomRepository = firestoreRepository
        } else {
            backendMode = BackendMode.DEMO
            roomRepository = DemoRoomRepository()
        }
    }

    private fun createFirestoreRepository(context: Context): FirestoreRoomRepository {
        val app = FirebaseApp.getApps(context).firstOrNull() ?: FirebaseApp.initializeApp(
            context,
            FirebaseOptions.Builder()
                .setApiKey(FirebaseConfig.API_KEY)
                .setApplicationId(FirebaseConfig.ANDROID_APPLICATION_ID)
                .setProjectId(FirebaseConfig.PROJECT_ID)
                .setStorageBucket(FirebaseConfig.STORAGE_BUCKET)
                .setGcmSenderId(FirebaseConfig.SENDER_ID)
                .build(),
        )
        return FirestoreRoomRepository(FirebaseFirestore.getInstance(app), FirebaseAuth.getInstance(app))
    }
}
