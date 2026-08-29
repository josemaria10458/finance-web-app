import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UserSessionService } from './core/services/user-session.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: `:host { display: block; height: 100%; }`,
})
export class AppComponent {
  /** Inicializa el vínculo usuario ↔ datos en Firestore. */
  private readonly _session = inject(UserSessionService);
}
