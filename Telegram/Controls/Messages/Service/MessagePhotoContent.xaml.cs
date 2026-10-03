//
// Copyright (c) Fela Ameghino 2015-2026
//
// Distributed under the GNU General Public License v3.0. (See accompanying
// file LICENSE or copy at https://www.gnu.org/licenses/gpl-3.0.txt)
//

using Telegram.Td.Api;
using Telegram.ViewModels;
using Windows.Foundation;
using Windows.UI.Xaml;

namespace Telegram.Controls.Messages.Service
{
    // A chat photo, a suggested profile photo, or a story mention: three contents that
    // all show one round picture, the middle one behind story segments.
    public sealed partial class MessagePhotoContent : MessageService
    {
        public MessagePhotoContent()
        {
            InitializeComponent();
        }

        protected override void UpdateContent(MessageViewModel message)
        {
            if (message.Content is MessageChatChangePhoto chatChangePhoto)
            {
                UpdatePhoto(message, chatChangePhoto.Photo);
            }
            else if (message.Content is MessageSuggestProfilePhoto suggestProfilePhoto)
            {
                // TODO: Here it should probably be the user, but it's not critical
                UpdatePhoto(message, suggestProfilePhoto.Photo);
            }
            else if (message.Content is MessageAsyncStory story)
            {
                UpdateStory(message, story);
            }
        }

        private void UpdatePhoto(MessageViewModel message, ChatPhoto photo)
        {
            Width = 216;

            Segments.Visibility = Visibility.Visible;
            View.Visibility = Visibility.Visible;

            Segments.SetChat(null, null, 120);
            Photo.Source = ProfilePictureSource.ChatPhoto(message.ClientService, message.Chat, photo, true);

            ViewLabel.Text = photo.Animation != null
                ? Strings.ViewVideoAction
                : Strings.ViewPhotoAction;
        }

        private void UpdateStory(MessageViewModel message, MessageAsyncStory story)
        {
            if (story.State == MessageStoryState.Expired)
            {
                // An expired story is text only, so the bubble goes back to hugging it.
                Width = double.NaN;

                Segments.Visibility = Visibility.Collapsed;
                View.Visibility = Visibility.Collapsed;

                return;
            }

            Width = 216;

            Segments.Visibility = Visibility.Visible;
            View.Visibility = Visibility.Visible;

            if (message.ClientService.TryGetUser(message.SenderId, out User user) && message.ClientService.TryGetActiveStoriesFromUser(user.Id, out ChatActiveStories activeStories))
            {
                Segments.UpdateSegments(120, story.Story?.PrivacySettings is StoryPrivacySettingsCloseFriends, activeStories.MaxReadStoryId < story.StoryId);
            }
            else
            {
                Segments.UpdateSegments(120, story.Story?.PrivacySettings is StoryPrivacySettingsCloseFriends, false);
            }

            Photo.Source = story.Story == null
                ? ProfilePictureSource.Chat(message.ClientService, message.Chat)
                : ProfilePictureSource.Story(message.ClientService, story.Story);

            ViewLabel.Text = Strings.StoryMentionedAction;
        }

        public override void Recycle()
        {
            base.Recycle();

            Photo.Source = null;
        }

        private async void Service_Click(object sender, RoutedEventArgs e)
        {
            var message = Message;
            if (message?.Delegate == null)
            {
                return;
            }

            if (message.Content is MessageAsyncStory)
            {
                ToastPopup.Show(XamlRoot, "Stories are not supported in this build.", ToastPopupIcon.Info);
            }
            else
            {
                message.Delegate.ExecuteServiceMessage(message);
            }
        }
    }
}
