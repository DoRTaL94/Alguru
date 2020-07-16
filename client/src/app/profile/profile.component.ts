import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { Subscription } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthService } from '../auth/auth.service';
import { ThemeService } from '../editor/theme/theme.service';
import { ProfileService } from './profile.service';

const BACKEND_URL = `${environment.apiUrl}/image`;
const UPLOAD_URL = BACKEND_URL + '/upload';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('selectFile', { read: ElementRef }) selectFile: ElementRef;
  @ViewChild('uploadImageForm', { read: ElementRef }) uploadImageForm: ElementRef;

  public username = '';
  public profileImageURL: string;
  public tmpProfileImageURL: string | ArrayBuffer;
  public solvedQuestions = 0;
  public contribPoints = 0;
  public contribProblems = 0;
  public contribComments = 0;
  public showUploadForm = false;
  public cropPopupOpen = false;
  public isLoading = false;
  public uploadURL = UPLOAD_URL;
  public showChangeImageBtn = false;
  private timestamp: string;
  private sub: Subscription;
  private theme = 'dark';

  constructor(
    private route: ActivatedRoute,
    private profileService: ProfileService,
    private themeService: ThemeService,
    private authService: AuthService
  ) {}

  ngAfterViewInit(): void {
    document.documentElement.style.setProperty('--site-background-img', 'none');
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.themeService.reset();
  }

  ngOnInit(): void {
    this.themeService.overrideProperty('--main-display', 'block');
    this.themeService.overrideProperty(
      '--site-background-img',
      'url("assets/home-page/homePageBackground.png") no-repeat'
    );
    this.themeService.overrideProperty('--main-padding', '3rem 0 0 0');
    this.themeService.setActiveThemeByName(this.theme);

    this.sub = this.profileService.getURLUpdatedListener().subscribe(this.onUploaded.bind(this));

    this.route.paramMap.subscribe((paramMap: ParamMap) => {
      if (paramMap.has('username')) {
        this.username = paramMap.get('username');
        this.showChangeImageBtn = this.username === this.authService.getUsername();
        this.profileImageURL = `${BACKEND_URL}/${this.username}`;
      }
    });
  }

  onImageURLBroken() {
    this.profileImageURL = null;
  }

  onSelectFileClick() {
    this.selectFile.nativeElement.click();
  }

  submit(event) {
    this.openCropPopup();

    if (!event.target || !event.target.files || event.target.files.length !== 1) {
      return;
    }

    const file = event.target.files[0];

    if (
      file.type !== 'image/jpeg' &&
      file.type !== 'image/png' &&
      file.type !== 'image/gif' &&
      file.type !== 'image/jpg'
    ) {
      return;
    }

    const fr = new FileReader();

    fr.onloadend = () => (this.tmpProfileImageURL = fr.result);
    fr.readAsDataURL(file);
    this.isLoading = false;
  }

  closeCropPopup() {
    this.isLoading = false;
    this.cropPopupOpen = false;
  }

  openCropPopup() {
    this.isLoading = true;
    this.cropPopupOpen = true;
  }

  onCropBtnClick() {
    this.isLoading = true;
  }

  onUploaded(url) {
    this.timestamp = new Date().getTime().toString();
    this.profileImageURL = `${url}?${this.timestamp}`;
    console.log(this.profileImageURL);
    this.closeCropPopup();
  }
}