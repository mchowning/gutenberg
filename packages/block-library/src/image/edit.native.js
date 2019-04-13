/**
 * External dependencies
 */
import React from 'react';
import { View, ImageBackground, Text, TouchableWithoutFeedback } from 'react-native';
import {
	subscribeMediaUpload,
	requestMediaPickFromMediaLibrary,
	requestMediaPickFromDeviceLibrary,
	requestMediaPickFromDeviceCamera,
	requestMediaImport,
	mediaUploadSync,
	requestImageFailedRetryDialog,
	requestImageUploadCancelDialog,
} from 'react-native-gutenberg-bridge';

/**
 * WordPress dependencies
 */
import {
	Toolbar,
	ToolbarButton,
	Spinner,
	Dashicon,
} from '@wordpress/components';
import {
	MediaPlaceholder,
	RichText,
	BlockControls,
	InspectorControls,
	BottomSheet,
	Picker,
} from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';
import { isURL } from '@wordpress/url';
import { doAction, hasAction } from '@wordpress/hooks';

/**
 * Internal dependencies
 */
import ImageSize from './image-size';
import styles from './styles.scss';

const MEDIA_UPLOAD_STATE_UPLOADING = 1;
const MEDIA_UPLOAD_STATE_SUCCEEDED = 2;
const MEDIA_UPLOAD_STATE_FAILED = 3;
const MEDIA_UPLOAD_STATE_RESET = 4;

const MEDIA_UPLOAD_BOTTOM_SHEET_VALUE_CHOOSE_FROM_DEVICE = 'choose_from_device';
const MEDIA_UPLOAD_BOTTOM_SHEET_VALUE_TAKE_PHOTO = 'take_photo';
const MEDIA_UPLOAD_BOTTOM_SHEET_VALUE_WORD_PRESS_LIBRARY = 'wordpress_media_library';

const LINK_DESTINATION_CUSTOM = 'custom';
const LINK_DESTINATION_NONE = 'none';

class ImageEdit extends React.Component {
	constructor( props ) {
		super( props );

		this.state = {
			showSettings: false,
			progress: 0,
			isUploadInProgress: false,
			isUploadFailed: false,
			isCaptionSelected: false,
		};

		this.mediaUpload = this.mediaUpload.bind( this );
		this.finishMediaUploadWithSuccess = this.finishMediaUploadWithSuccess.bind( this );
		this.finishMediaUploadWithFailure = this.finishMediaUploadWithFailure.bind( this );
		this.updateMediaProgress = this.updateMediaProgress.bind( this );
		this.updateAlt = this.updateAlt.bind( this );
		this.updateImageURL = this.updateImageURL.bind( this );
		this.onSetLinkDestination = this.onSetLinkDestination.bind( this );
		this.onImagePressed = this.onImagePressed.bind( this );
		this.onClearSettings = this.onClearSettings.bind( this );
		this.onFocusCaption = this.onFocusCaption.bind( this );
	}

	componentDidMount() {
		this.addMediaUploadListener();

		const { attributes, setAttributes } = this.props;

		if ( attributes.id && ! isURL( attributes.url ) ) {
			if ( attributes.url.indexOf( 'file:' ) === 0 ) {
				requestMediaImport( attributes.url, ( mediaId, mediaUri ) => {
					if ( mediaUri ) {
						setAttributes( { url: mediaUri, id: mediaId } );
					}
				} );
			}
			mediaUploadSync();
		}
	}

	componentWillUnmount() {
		// this action will only exist if the user pressed the trash button on the block holder
		if ( hasAction( 'blocks.onRemoveBlockCheckUpload' ) && this.state.isUploadInProgress ) {
			doAction( 'blocks.onRemoveBlockCheckUpload', this.props.attributes.id );
		}
		this.removeMediaUploadListener();
	}

	componentWillReceiveProps( nextProps ) {
		// Avoid a UI flicker in the toolbar by insuring that isCaptionSelected
		// is updated immediately any time the isSelected prop becomes false
		this.setState( ( state ) => ( {
			isCaptionSelected: nextProps.isSelected && state.isCaptionSelected,
		} ) );
	}

	onImagePressed() {
		const { attributes } = this.props;

		if ( this.state.isUploadInProgress ) {
			requestImageUploadCancelDialog( attributes.id );
		} else if ( attributes.id && ! isURL( attributes.url ) ) {
			requestImageFailedRetryDialog( attributes.id );
		}

		this._caption.blur();
		this.setState( {
			isCaptionSelected: false,
		} );
	}

	mediaUpload( payload ) {
		const { attributes } = this.props;

		if ( payload.mediaId !== attributes.id ) {
			return;
		}

		switch ( payload.state ) {
			case MEDIA_UPLOAD_STATE_UPLOADING:
				this.updateMediaProgress( payload );
				break;
			case MEDIA_UPLOAD_STATE_SUCCEEDED:
				this.finishMediaUploadWithSuccess( payload );
				break;
			case MEDIA_UPLOAD_STATE_FAILED:
				this.finishMediaUploadWithFailure( payload );
				break;
			case MEDIA_UPLOAD_STATE_RESET:
				this.mediaUploadStateReset( payload );
				break;
		}
	}

	updateMediaProgress( payload ) {
		const { setAttributes } = this.props;
		this.setState( { progress: payload.progress, isUploadInProgress: true, isUploadFailed: false } );
		if ( payload.mediaUrl ) {
			setAttributes( { url: payload.mediaUrl } );
		}
	}

	finishMediaUploadWithSuccess( payload ) {
		const { setAttributes } = this.props;

		setAttributes( { url: payload.mediaUrl, id: payload.mediaServerId } );
		this.setState( { isUploadInProgress: false } );
	}

	finishMediaUploadWithFailure( payload ) {
		const { setAttributes } = this.props;

		setAttributes( { id: payload.mediaId } );
		this.setState( { isUploadInProgress: false, isUploadFailed: true } );
	}

	mediaUploadStateReset( payload ) {
		const { setAttributes } = this.props;

		setAttributes( { id: payload.mediaId, url: null } );
		this.setState( { isUploadInProgress: false, isUploadFailed: false } );
	}

	addMediaUploadListener() {
		//if we already have a subscription not worth doing it again
		if ( this.subscriptionParentMediaUpload ) {
			return;
		}
		this.subscriptionParentMediaUpload = subscribeMediaUpload( ( payload ) => {
			this.mediaUpload( payload );
		} );
	}

	removeMediaUploadListener() {
		if ( this.subscriptionParentMediaUpload ) {
			this.subscriptionParentMediaUpload.remove();
		}
	}

	updateAlt( newAlt ) {
		this.props.setAttributes( { alt: newAlt } );
	}

	updateImageURL( url ) {
		this.props.setAttributes( { url, width: undefined, height: undefined } );
	}

	onSetLinkDestination( href ) {
		this.props.setAttributes( {
			linkDestination: LINK_DESTINATION_CUSTOM,
			href,
		} );
	}

	onClearSettings() {
		this.props.setAttributes( {
			alt: '',
			linkDestination: LINK_DESTINATION_NONE,
			href: undefined,
		} );
	}

	getMediaOptionsItems() {
		return [
			{ icon: 'format-image', value: MEDIA_UPLOAD_BOTTOM_SHEET_VALUE_CHOOSE_FROM_DEVICE, label: __( 'Choose from device' ) },
			{ icon: 'camera', value: MEDIA_UPLOAD_BOTTOM_SHEET_VALUE_TAKE_PHOTO, label: __( 'Take a Photo' ) },
			{ icon: 'wordpress-alt', value: MEDIA_UPLOAD_BOTTOM_SHEET_VALUE_WORD_PRESS_LIBRARY, label: __( 'WordPress Media Library' ) },
		];
	}

	onFocusCaption() {
		if ( this.props.onFocus ) {
			this.props.onFocus();
		}
		if ( ! this.state.isCaptionSelected ) {
			this.setState( {
				isCaptionSelected: true,
			} );
		}
	}

	render() {
		const { attributes, isSelected, setAttributes } = this.props;
		const { url, caption, height, width, alt, href } = attributes;

		const onMediaLibraryButtonPressed = () => {
			requestMediaPickFromMediaLibrary( ( mediaId, mediaUrl ) => {
				if ( mediaUrl ) {
					setAttributes( { id: mediaId, url: mediaUrl } );
				}
			} );
		};

		const onMediaUploadButtonPressed = () => {
			requestMediaPickFromDeviceLibrary( ( mediaId, mediaUri ) => {
				if ( mediaUri ) {
					setAttributes( { url: mediaUri, id: mediaId } );
				}
			} );
		};

		const onMediaCaptureButtonPressed = () => {
			requestMediaPickFromDeviceCamera( ( mediaId, mediaUri ) => {
				if ( mediaUri ) {
					setAttributes( { url: mediaUri, id: mediaId } );
				}
			} );
		};

		const onImageSettingsButtonPressed = () => {
			this.setState( { showSettings: true } );
		};

		const onImageSettingsClose = () => {
			this.setState( { showSettings: false } );
		};

		let picker;

		const onMediaOptionsButtonPressed = () => {
			picker.presentPicker();
		};

		const toolbarEditButton = (
			<Toolbar>
				<ToolbarButton
					label={ __( 'Edit image' ) }
					icon="edit"
					onClick={ onMediaOptionsButtonPressed }
				/>
			</Toolbar>
		);

		const getInspectorControls = () => (
			<BottomSheet
				isVisible={ this.state.showSettings }
				onClose={ onImageSettingsClose }
				hideHeader
			>
				<BottomSheet.Cell
					icon={ 'admin-links' }
					label={ __( 'Link To' ) }
					value={ href || '' }
					valuePlaceholder={ __( 'Add URL' ) }
					onChangeValue={ this.onSetLinkDestination }
					autoCapitalize="none"
					autoCorrect={ false }
				/>
				<BottomSheet.Cell
					icon={ 'editor-textcolor' }
					label={ __( 'Alt Text' ) }
					value={ alt || '' }
					valuePlaceholder={ __( 'None' ) }
					separatorType={ 'fullWidth' }
					onChangeValue={ this.updateAlt }
				/>
				<BottomSheet.Cell
					label={ __( 'Clear All Settings' ) }
					labelStyle={ styles.clearSettingsButton }
					separatorType={ 'none' }
					onPress={ this.onClearSettings }
				/>
			</BottomSheet>
		);

		const mediaOptions = this.getMediaOptionsItems();

		const getMediaOptions = () => (
			<Picker
				hideCancelButton={ true }
				ref={ ( instance ) => picker = instance }
				options={ mediaOptions }
				onChange={ ( value ) => {
					if ( value === MEDIA_UPLOAD_BOTTOM_SHEET_VALUE_CHOOSE_FROM_DEVICE ) {
						onMediaUploadButtonPressed();
					} else if ( value === MEDIA_UPLOAD_BOTTOM_SHEET_VALUE_TAKE_PHOTO ) {
						onMediaCaptureButtonPressed();
					} else if ( value === MEDIA_UPLOAD_BOTTOM_SHEET_VALUE_WORD_PRESS_LIBRARY ) {
						onMediaLibraryButtonPressed();
					}
				} }
			/>
		);

		if ( ! url ) {
			return (
				<View style={ { flex: 1 } } >
					{ getMediaOptions() }
					<MediaPlaceholder
						onMediaOptionsPressed={ onMediaOptionsButtonPressed }
					/>
				</View>
			);
		}

		const showSpinner = this.state.isUploadInProgress;
		const opacity = this.state.isUploadInProgress ? 0.3 : 1;
		const progress = this.state.progress * 100;

		return (
			<TouchableWithoutFeedback onPress={ this.onImagePressed } disabled={ ! isSelected }>
				<View style={ { flex: 1 } }>
					{ showSpinner && <Spinner progress={ progress } /> }
					{ ( ! this.state.isCaptionSelected ) &&
						<BlockControls>
							{ toolbarEditButton }
						</BlockControls>
					}
					<InspectorControls>
						<ToolbarButton
							label={ __( 'Image Settings' ) }
							icon="admin-generic"
							onClick={ onImageSettingsButtonPressed }
						/>
					</InspectorControls>
					<ImageSize src={ url } >
						{ ( sizes ) => {
							const {
								imageWidthWithinContainer,
								imageHeightWithinContainer,
							} = sizes;

							let finalHeight = imageHeightWithinContainer;
							if ( height > 0 && height < imageHeightWithinContainer ) {
								finalHeight = height;
							}

							let finalWidth = imageWidthWithinContainer;
							if ( width > 0 && width < imageWidthWithinContainer ) {
								finalWidth = width;
							}

							return (
								<View style={ { flex: 1 } } >
									{ getInspectorControls() }
									{ getMediaOptions() }
									{ ! imageWidthWithinContainer && <View style={ styles.imageContainer } >
										<Dashicon icon={ 'format-image' } size={ 300 } />
									</View> }
									<ImageBackground
										style={ { width: finalWidth, height: finalHeight, opacity } }
										resizeMethod="scale"
										source={ { uri: url } }
										key={ url }
									>
										{ this.state.isUploadFailed &&
											<View style={ styles.imageContainer } >
												<Dashicon icon={ 'image-rotate' } ariaPressed={ 'dashicon-active' } />
												<Text style={ styles.uploadFailedText }>{ __( 'Failed to insert media.\nPlease tap for options.' ) }</Text>
											</View>
										}
									</ImageBackground>
								</View>
							);
						} }
					</ImageSize>
					{ ( ! RichText.isEmpty( caption ) > 0 || isSelected ) && (
						<View style={ { padding: 12, flex: 1 } }>
							<RichText
								setRef={ ( ref ) => {
									this._caption = ref;
								} }
								tagName="p"
								placeholder={ __( 'Write caption…' ) }
								value={ caption }
								onChange={ ( newCaption ) => setAttributes( { caption: newCaption } ) }
								onFocus={ this.onFocusCaption }
								//onBlur={ this.props.onBlur } // always assign onBlur as props (??)
								isSelected={ this.state.isCaptionSelected }
								fontSize={ 14 }
								underlineColorAndroid="transparent"
							/>
						</View>
					) }
				</View>
			</TouchableWithoutFeedback>
		);
	}
}

export default ImageEdit;
