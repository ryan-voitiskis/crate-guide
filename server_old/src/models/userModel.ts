import mongoose, { Types } from "mongoose";

interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  createdAt?: string;
  updatedAt?: string;
  discogsUID?: string;
  discogsToken: string;
  discogsTokenSecret: string;
  discogsRequestToken: string;
  discogsRequestTokenSecret: string;
  justCompleteDiscogsOAuth: boolean;
  discogsUsername: string;
  spotifyToken: string;
  spotifyRefreshToken: string;
  spotifyNonce: string;
  spotifyTokenTimestamp: number;
  spotifyTokenExpiresIn: number;
  passwordResetToken: string;
  passwordResetTokenCreatedAt: string;
  settings: {
    theme: string;
    turntableTheme: string;
    turntablePitchRange: number;
    selectedCrate: string;
    keyFormat: string;
    listLayout: number;
  };
}
const userSchema = new mongoose.Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, "Please add a name"],
    },
    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
    },
    password: {
      type: String,
      required: [true, "Please add a password"],
    },
    discogsUsername: {
      type: String,
    },
    discogsToken: {
      type: String,
    },
    discogsTokenSecret: {
      type: String,
    },
    // for oauth flow only. use discogsToken for discogs API calls
    discogsRequestToken: {
      type: String,
    },
    // for oauth flow only. use discogsTokenSecret for discogs API calls
    discogsRequestTokenSecret: {
      type: String,
    },
    // flag to communicate to front end that OAuth flow successfully complete
    justCompleteDiscogsOAuth: {
      type: Boolean,
      default: false,
    },
    // authorization_code OAuth token, valid for 1 minute
    spotifyToken: {
      type: String,
    },
    // token provided during OAuth for refreshing token when spotifyToken expires
    spotifyRefreshToken: {
      type: String,
    },
    // nonce (state) used to find user in DB from OAuth callback function
    spotifyNonce: {
      type: String,
    },
    // time token was saved
    spotifyTokenTimestamp: {
      type: Number,
    },
    // the time period (in seconds) for which the Access Token is valid
    spotifyTokenExpiresIn: {
      type: Number,
    },
    // token used to reset password
    passwordResetToken: {
      type: String,
    },
    // time token was created
    passwordResetTokenCreatedAt: {
      type: String,
    },
    settings: {
      theme: {
        type: String,
        default: "auto",
      },
      turntableTheme: {
        type: String,
        default: "black",
      },
      turntablePitchRange: {
        type: Number,
        default: 8,
      },
      selectedCrate: {
        type: String,
        default: "all",
      },
      keyFormat: {
        type: String,
        default: "key",
      },
      listLayout: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  },
);

const User = mongoose.model("User", userSchema);
export { IUser, User };
