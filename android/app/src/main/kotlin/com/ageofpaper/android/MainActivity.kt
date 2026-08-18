package com.ageofpaper.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ageofpaper.android.data.AppContainer
import com.ageofpaper.android.ui.AgeOfPaperApp
import com.ageofpaper.android.ui.GameViewModel
import com.ageofpaper.android.ui.theme.AgeOfPaperTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = AppContainer(applicationContext)
        setContent {
            AgeOfPaperTheme {
                val model: GameViewModel = viewModel(factory = GameViewModelFactory(container))
                AgeOfPaperApp(model)
            }
        }
    }
}

private class GameViewModelFactory(private val container: AppContainer) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = GameViewModel(container) as T
}
